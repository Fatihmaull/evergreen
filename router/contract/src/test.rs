//! Audit-style tests (PH2-E4-08). No network: the Soroban test host only.
extern crate std;
use super::*;
use evergreen_router_test_subject::{Subject, SubjectClient};
use soroban_sdk::testutils::{
    storage::{Instance as _, Persistent as _, Temporary as _},
    Address as _, AuthorizedFunction, Ledger as _,
};
use soroban_sdk::{symbol_short, token::StellarAssetClient, Env, IntoVal, Symbol};

struct Setup {
    env: Env,
    router: Address,
    target: Address,
    token: Address,
    payer: Address,
    treasury: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.ledger().set_sequence_number(100);
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let payer = Address::generate(&env);
    let treasury = Address::generate(&env);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &token).mint(&payer, &1_000);
    let router = env.register(Router, (token.clone(), treasury.clone()));
    let target = env.register(Subject, ());
    SubjectClient::new(&env, &target).seed(&7);
    Setup {
        env,
        router,
        target,
        token,
        payer,
        treasury,
    }
}

impl Setup {
    fn client(&self) -> RouterClient<'_> {
        RouterClient::new(&self.env, &self.router)
    }
    fn balance(&self, who: &Address) -> i128 {
        token::TokenClient::new(&self.env, &self.token).balance(who)
    }
    fn instance_ttl(&self) -> u32 {
        self.env
            .as_contract(&self.target, || self.env.storage().instance().get_ttl())
    }
}

#[test]
fn constructor_stores_treasury_and_token() {
    let s = setup();
    assert_eq!(s.client().treasury(), s.treasury);
    assert_eq!(s.client().fee_token(), s.token);
}

#[test]
fn takes_fee_to_treasury_and_extends_instance_and_code() {
    let s = setup();
    s.client()
        .fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    assert_eq!(s.instance_ttl(), 200_000);
    assert_eq!(s.balance(&s.payer), 990);
    assert_eq!(s.balance(&s.treasury), 10);
    assert_eq!(s.balance(&s.router), 0, "the router never holds funds");
}

#[test]
fn needs_exactly_the_payers_authorisation_for_this_call() {
    let s = setup();
    s.client()
        .fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.payer);
    match &auths[0].1.function {
        AuthorizedFunction::Contract((addr, name, _)) => {
            assert_eq!(addr, &s.router);
            assert_eq!(name, &Symbol::new(&s.env, "fee_and_extend"));
        }
        _ => panic!("unexpected authorised function"),
    }
}

#[test]
#[should_panic]
fn refuses_without_payer_auth() {
    let s = setup();
    s.env.set_auths(&[]);
    s.client()
        .fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
}

#[test]
fn another_signer_cannot_spend_the_payers_balance() {
    let s = setup();
    let attacker = Address::generate(&s.env);
    // Only the attacker authorises; the call names the victim as payer.
    s.env.set_auths(&[]);
    s.env.mock_auths(&[soroban_sdk::testutils::MockAuth {
        address: &attacker,
        invoke: &soroban_sdk::testutils::MockAuthInvoke {
            contract: &s.router,
            fn_name: "fee_and_extend",
            args: (&s.payer, 10_i128, &s.target, 100_000_u32, 200_000_u32).into_val(&s.env),
            sub_invokes: &[],
        },
    }]);
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    assert!(res.is_err());
    assert_eq!(s.balance(&s.payer), 1_000);
}

#[test]
fn refuses_a_negative_fee_and_moves_nothing() {
    let s = setup();
    let before = s.instance_ttl();
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &-1, &s.target, &100_000, &200_000);
    assert_eq!(res, Err(Ok(RouterError::NegativeFee)));
    assert_eq!(s.balance(&s.payer), 1_000);
    assert_eq!(s.instance_ttl(), before);
}

#[test]
fn refuses_threshold_above_extend_to() {
    let s = setup();
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &10, &s.target, &200_001, &200_000);
    assert_eq!(res, Err(Ok(RouterError::ThresholdAboveExtendTo)));
    assert_eq!(s.balance(&s.payer), 1_000);
}

#[test]
fn zero_fee_extends_without_a_transfer() {
    // ADR-009 §3 (#389): the fee is voluntary on-chain. `fee == 0` succeeds,
    // moves no funds, and still extends the target's instance and code TTL.
    let s = setup();
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &0, &s.target, &100_000, &200_000);
    assert_eq!(res, Ok(Ok(())), "a zero fee is accepted");
    assert_eq!(s.instance_ttl(), 200_000, "and still extends");
    assert_eq!(s.balance(&s.payer), 1_000, "no transfer from the payer");
    assert_eq!(s.balance(&s.treasury), 0, "no transfer to the treasury");
    assert_eq!(s.balance(&s.router), 0, "the router never holds funds");
}

#[test]
fn an_unaffordable_fee_fails_the_whole_call_and_extends_nothing() {
    let s = setup();
    let before = s.instance_ttl();
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &1_001, &s.target, &100_000, &200_000);
    assert!(res.is_err());
    assert_eq!(s.instance_ttl(), before);
    assert_eq!(s.balance(&s.payer), 1_000);
}

#[test]
fn never_extends_the_targets_persistent_or_temporary_data() {
    let s = setup();
    let (p0, t0) = s.env.as_contract(&s.target, || {
        (
            s.env.storage().persistent().get_ttl(&symbol_short!("data")),
            s.env.storage().temporary().get_ttl(&symbol_short!("tmp")),
        )
    });
    s.client()
        .fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    let (p1, t1) = s.env.as_contract(&s.target, || {
        (
            s.env.storage().persistent().get_ttl(&symbol_short!("data")),
            s.env.storage().temporary().get_ttl(&symbol_short!("tmp")),
        )
    });
    assert_eq!(p0, p1);
    assert_eq!(t0, t1);
}

#[test]
fn the_caller_cannot_redirect_the_fee() {
    // The only fee destination is the one stored at deploy; no argument names it.
    let s = setup();
    let other = Address::generate(&s.env);
    s.client()
        .fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    assert_eq!(s.balance(&other), 0);
    assert_eq!(s.balance(&s.treasury), 10);
}

#[test]
fn refuses_the_router_itself_as_treasury() {
    let env = Env::default();
    let token = env
        .register_stellar_asset_contract_v2(Address::generate(&env))
        .address();
    let id = Address::generate(&env);
    // Registering at a known address lets the constructor see itself as treasury.
    let res = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        env.register_at(&id, Router, (token.clone(), id.clone()));
    }));
    assert!(res.is_err());
}

// --- PH2-E4-08 hardening (2026-10-30): edges an auditor would probe. ---

#[test]
fn the_constructor_cannot_be_called_again() {
    // `__constructor` runs only at deploy; a later call must not reset the treasury.
    let s = setup();
    let attacker = Address::generate(&s.env);
    let res = s.env.try_invoke_contract::<(), RouterError>(
        &s.router,
        &Symbol::new(&s.env, "__constructor"),
        (s.token.clone(), attacker.clone()).into_val(&s.env),
    );
    assert!(res.is_err());
    assert_eq!(s.client().treasury(), s.treasury);
}

#[test]
fn threshold_equal_to_extend_to_is_accepted() {
    let s = setup();
    s.client()
        .fee_and_extend(&s.payer, &1, &s.target, &150_000, &150_000);
    assert_eq!(s.instance_ttl(), 150_000);
    assert_eq!(s.balance(&s.treasury), 1);
}

#[test]
fn the_payers_whole_balance_can_be_the_fee_and_nothing_more_moves() {
    let s = setup();
    s.client()
        .fee_and_extend(&s.payer, &1_000, &s.target, &100_000, &200_000);
    assert_eq!(s.balance(&s.payer), 0);
    assert_eq!(s.balance(&s.treasury), 1_000);
    assert_eq!(s.balance(&s.router), 0);
}

#[test]
fn an_i128_max_fee_fails_and_moves_nothing() {
    let s = setup();
    let before = s.instance_ttl();
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &i128::MAX, &s.target, &100_000, &200_000);
    assert!(res.is_err());
    assert_eq!(s.balance(&s.payer), 1_000);
    assert_eq!(s.balance(&s.treasury), 0);
    assert_eq!(s.instance_ttl(), before);
}

#[test]
fn a_target_that_is_not_a_contract_fails_and_moves_nothing() {
    let s = setup();
    let not_a_contract = Address::generate(&s.env);
    let res = s
        .client()
        .try_fee_and_extend(&s.payer, &10, &not_a_contract, &100_000, &200_000);
    assert!(res.is_err());
    assert_eq!(
        s.balance(&s.payer),
        1_000,
        "fee rolled back with the failed extend"
    );
    assert_eq!(s.balance(&s.treasury), 0);
}

#[test]
fn repeated_calls_charge_each_time_and_never_accumulate_in_the_router() {
    let s = setup();
    for _ in 0..3 {
        s.client()
            .fee_and_extend(&s.payer, &5, &s.target, &100_000, &200_000);
    }
    assert_eq!(s.balance(&s.treasury), 15);
    assert_eq!(s.balance(&s.router), 0);
}

#[test]
fn the_router_can_extend_its_own_instance_without_changing_its_config() {
    let s = setup();
    s.client()
        .fee_and_extend(&s.payer, &0, &s.router, &100_000, &200_000);
    assert_eq!(s.client().treasury(), s.treasury);
    assert_eq!(s.client().fee_token(), s.token);
}

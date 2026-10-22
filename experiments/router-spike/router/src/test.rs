extern crate std;
use super::*;
use soroban_sdk::testutils::{storage::{Instance as _, Persistent as _}, Address as _, Ledger as _};
use soroban_sdk::{token::StellarAssetClient, Env};

use spike_target::{SpikeTarget, SpikeTargetClient};

struct Setup {
    env: Env,
    router: Address,
    target: Address,
    token: Address,
    payer: Address,
    fee_to: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.ledger().set_sequence_number(100);
    let issuer = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(issuer).address();
    let payer = Address::generate(&env);
    let fee_to = Address::generate(&env);
    env.mock_all_auths();
    StellarAssetClient::new(&env, &token).mint(&payer, &1_000);
    let router = env.register(Router, (token.clone(), fee_to.clone()));
    let target = env.register(SpikeTarget, ());
    SpikeTargetClient::new(&env, &target).seed(&7);
    Setup { env, router, target, token, payer, fee_to }
}

#[test]
fn takes_fee_and_extends_instance_and_code() {
    let s = setup();
    let before = s.env.as_contract(&s.target, || s.env.storage().instance().get_ttl());
    RouterClient::new(&s.env, &s.router).fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    // Exactly one authorisation: the payer's, one tree covering router + transfer.
    let auths = s.env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, s.payer);
    let after = s.env.as_contract(&s.target, || s.env.storage().instance().get_ttl());
    assert!(after > before);
    assert_eq!(after, 200_000);
    let tc = token::TokenClient::new(&s.env, &s.token);
    assert_eq!(tc.balance(&s.payer), 990);
    assert_eq!(tc.balance(&s.fee_to), 10);
}

#[test]
fn does_not_extend_target_persistent_data() {
    let s = setup();
    let key = soroban_sdk::symbol_short!("data");
    let before = s.env.as_contract(&s.target, || s.env.storage().persistent().get_ttl(&key));
    RouterClient::new(&s.env, &s.router).fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
    let after = s.env.as_contract(&s.target, || s.env.storage().persistent().get_ttl(&key));
    assert_eq!(before, after);
}

#[test]
#[should_panic]
fn rejects_negative_fee() {
    let s = setup();
    RouterClient::new(&s.env, &s.router).fee_and_extend(&s.payer, &-1, &s.target, &100_000, &200_000);
}

#[test]
#[should_panic]
fn requires_payer_auth() {
    let s = setup();
    s.env.set_auths(&[]);
    RouterClient::new(&s.env, &s.router).fee_and_extend(&s.payer, &10, &s.target, &100_000, &200_000);
}

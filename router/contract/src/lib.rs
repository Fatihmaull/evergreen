#![no_std]
//! Evergreen's fee router (PH2-E4-08, ADR-009).
//!
//! One invocation, one user signature: transfer Evergreen's fee from the payer
//! straight to the treasury, then extend the target contract's **instance and
//! code** TTL. Both happen or neither does.
//!
//! What it does NOT do, by design:
//! - It cannot extend a target's persistent or temporary data. No host
//!   function lets one contract extend another's data entries; persistent data
//!   needs an allowance (ADR-009 §1a). Nothing here may be read as "fully safe".
//! - It holds no funds, has no admin, no upgrade and no withdraw path. The fee
//!   token and treasury are set once, at deploy, by the constructor. No address
//!   is compiled in; changing the treasury means deploying a new router.
//! - It never pays rent. Rent is charged to the transaction's source account,
//!   the user (AGENTS.md hard rule 5).
//! - It has no authority over the target: `extend_ttl` is permissionless.
use soroban_sdk::{contract, contracterror, contractimpl, contracttype, token, Address, Env};

#[contracttype]
#[derive(Clone)]
enum Key {
    FeeToken,
    Treasury,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum RouterError {
    /// The fee was below zero.
    NegativeFee = 1,
    /// `threshold` was greater than `extend_to`.
    ThresholdAboveExtendTo = 2,
    /// The treasury was the router itself, which would lock fees in a contract with no withdraw path.
    TreasuryIsRouter = 3,
}

#[contract]
pub struct Router;

#[contractimpl]
impl Router {
    /// Set once, at deploy. `treasury` is the address of `PH2-E4-03`.
    pub fn __constructor(
        env: Env,
        fee_token: Address,
        treasury: Address,
    ) -> Result<(), RouterError> {
        if treasury == env.current_contract_address() {
            return Err(RouterError::TreasuryIsRouter);
        }
        let store = env.storage().instance();
        store.set(&Key::FeeToken, &fee_token);
        store.set(&Key::Treasury, &treasury);
        Ok(())
    }

    /// Transfer `fee` (in the fee token's base units; stroops for native XLM)
    /// from `payer` to the treasury, then extend `target`'s instance and code
    /// TTL with `threshold` and `extend_to` (ledgers).
    pub fn fee_and_extend(
        env: Env,
        payer: Address,
        fee: i128,
        target: Address,
        threshold: u32,
        extend_to: u32,
    ) -> Result<(), RouterError> {
        payer.require_auth();
        if fee < 0 {
            return Err(RouterError::NegativeFee);
        }
        if threshold > extend_to {
            return Err(RouterError::ThresholdAboveExtendTo);
        }
        if fee > 0 {
            let store = env.storage().instance();
            let fee_token: Address = store.get(&Key::FeeToken).unwrap();
            let treasury: Address = store.get(&Key::Treasury).unwrap();
            token::TokenClient::new(&env, &fee_token).transfer(&payer, &treasury, &fee);
        }
        env.deployer().extend_ttl(target, threshold, extend_to);
        Ok(())
    }

    pub fn treasury(env: Env) -> Address {
        env.storage().instance().get(&Key::Treasury).unwrap()
    }

    pub fn fee_token(env: Env) -> Address {
        env.storage().instance().get(&Key::FeeToken).unwrap()
    }
}

#[cfg(test)]
mod test;

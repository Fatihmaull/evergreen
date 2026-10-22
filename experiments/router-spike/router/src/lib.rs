#![no_std]
//! PH2-E4-07 spike: can ONE invocation, ONE user signature, take Evergreen's
//! fee AND extend a target contract's TTL?
//!
//! Host functions used (soroban-sdk 27.0.6, verified in the SDK source):
//! - `token::TokenClient::transfer`: SEP-41 transfer, payer must authorise.
//! - `env.deployer().extend_ttl(addr, threshold, extend_to)`: extends ANOTHER
//!   contract's instance + code entries. There is no SDK/host function that
//!   extends another contract's persistent (or temporary) data: the storage
//!   `extend_ttl` calls only address the CURRENT contract's keys.
//!
//! The rent for the extension is charged to the transaction's source account,
//! i.e. the user who signs. Evergreen pays nothing (AGENTS.md hard rule 5).
//! The fee recipient and token are fixed at construction so a caller cannot
//! redirect the fee.
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
enum Key {
    FeeToken,
    FeeTo,
}

#[contract]
pub struct Router;

#[contractimpl]
impl Router {
    pub fn __constructor(env: Env, fee_token: Address, fee_to: Address) {
        env.storage().instance().set(&Key::FeeToken, &fee_token);
        env.storage().instance().set(&Key::FeeTo, &fee_to);
    }

    /// Transfer `fee` from `payer` to the fixed fee recipient, then extend
    /// `target`'s instance and code TTL. Both happen or neither does.
    pub fn fee_and_extend(
        env: Env,
        payer: Address,
        fee: i128,
        target: Address,
        threshold: u32,
        extend_to: u32,
    ) {
        payer.require_auth();
        if fee < 0 {
            panic!("negative fee");
        }
        let fee_token: Address = env.storage().instance().get(&Key::FeeToken).unwrap();
        let fee_to: Address = env.storage().instance().get(&Key::FeeTo).unwrap();
        if fee > 0 {
            token::TokenClient::new(&env, &fee_token).transfer(&payer, &fee_to, &fee);
        }
        env.deployer().extend_ttl(target, threshold, extend_to);
    }
}

#[cfg(test)]
mod test;

#![no_std]
//! Test-only stand-in for a user's contract: one persistent and one temporary
//! entry, so tests can prove the router leaves contract data alone.
use soroban_sdk::{contract, contractimpl, symbol_short, Env};

#[contract]
pub struct Subject;

#[contractimpl]
impl Subject {
    pub fn seed(env: Env, value: u32) {
        env.storage()
            .persistent()
            .set(&symbol_short!("data"), &value);
        env.storage().temporary().set(&symbol_short!("tmp"), &value);
    }
}

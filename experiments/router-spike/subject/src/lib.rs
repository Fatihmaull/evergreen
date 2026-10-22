#![no_std]
//! PH2-E4-07 spike target: a stand-in for "some user's contract".
//!
//! Its own Wasm (not the guinea-pig's) so extending its code entry can never
//! touch guinea-pig A/B/C's shared code entry. `seed` writes one persistent
//! entry so the rent split instance / code / persistent can be measured.
use soroban_sdk::{contract, contractimpl, symbol_short, Env};

#[contract]
pub struct SpikeTarget;

#[contractimpl]
impl SpikeTarget {
    pub fn seed(env: Env, value: u32) {
        env.storage().persistent().set(&symbol_short!("data"), &value);
    }
    pub fn read(env: Env) -> Option<u32> {
        env.storage().persistent().get(&symbol_short!("data"))
    }
}

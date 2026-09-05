#![no_std]
//! The guinea-pig contract — Evergreen's testnet test subject.
//!
//! This is a TEST FIXTURE, not a product deliverable. Its only job is to give us
//! a contract whose ledger entries we own, so we can watch TTL decay, measure
//! real archival behaviour, and prove the engine extends TTL before expiry.
//!
//! # Why it writes to three storage types
//!
//! Soroban entry types expire differently, and Evergreen must report them
//! differently (see `docs/SOROBAN-PRIMER.md`):
//!
//! | Entry type   | On expiry              | Restorable? |
//! |--------------|------------------------|-------------|
//! | Instance     | archived               | yes         |
//! | Code (Wasm)  | archived               | yes         |
//! | Persistent   | archived               | yes         |
//! | Temporary    | **deleted**            | **no**      |
//!
//! Deploying this contract gives us instance and code entries for free. It
//! writes one persistent entry and one temporary entry so all four types exist
//! on a single contract — which is what `W1-D4-04b` needs in order to measure
//! the real minimum TTL per entry type rather than assuming one.
//!
//! Two contracts get deployed from this same code, with different jobs:
//!
//! - **Guinea-pig A** — the working subject. Bump it, break it, redeploy it.
//! - **Guinea-pig B** — the natural-decay subject, deployed early and left to
//!   age so it can be saved unattended at `W3-D18-02b`.
//!
//! B must never enter the engine's watched-contract list before that moment.
//! If the engine sees it, it will dutifully bump it and destroy the evidence it
//! was deployed to produce. See `scripts/deploy-guinea-pig.sh` and
//! `docs/SETUP.md`.

use soroban_sdk::{contract, contractimpl, contracttype, Env, Symbol};

/// Storage keys. Kept as an enum so every entry this contract writes is
/// enumerable from one place — the CLI's scan has to find all of them.
#[contracttype]
pub enum Key {
    /// A persistent entry: archived on expiry, restorable.
    Persistent,
    /// A temporary entry: deleted on expiry, unrecoverable.
    Temporary,
    /// An instance entry: shares the contract instance's TTL.
    Instance,
}

#[contract]
pub struct GuineaPig;

#[contractimpl]
impl GuineaPig {
    /// Write one entry of each storage type, so all four entry types exist on
    /// this contract. Call once after deploy.
    ///
    /// Takes no authorization: this is a throwaway testnet fixture, and adding
    /// auth would only make the deploy script harder to run.
    pub fn seed(env: Env, value: u32) {
        env.storage().persistent().set(&Key::Persistent, &value);
        env.storage().temporary().set(&Key::Temporary, &value);
        env.storage().instance().set(&Key::Instance, &value);
    }

    /// Read the persistent entry. Returns `None` once the entry has been
    /// archived — which is the state Evergreen exists to prevent.
    pub fn get_persistent(env: Env) -> Option<u32> {
        env.storage().persistent().get(&Key::Persistent)
    }

    /// Read the temporary entry. Returns `None` once it has been **deleted**.
    /// Unlike the persistent entry, this one cannot be restored, which is why
    /// the CLI must report the two cases differently.
    pub fn get_temporary(env: Env) -> Option<u32> {
        env.storage().temporary().get(&Key::Temporary)
    }

    /// Read the instance entry.
    pub fn get_instance(env: Env) -> Option<u32> {
        env.storage().instance().get(&Key::Instance)
    }

    /// A trivial identifying call, so a deploy can be smoke-tested without
    /// writing anything.
    pub fn ping(env: Env) -> Symbol {
        Symbol::new(&env, "guinea_pig")
    }
}

mod test;

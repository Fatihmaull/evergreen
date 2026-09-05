#![cfg(test)]

use super::{GuineaPig, GuineaPigClient};
use soroban_sdk::Env;

/// These run against the local test environment, not testnet — consistent with
/// docs/CONVENTIONS.md § Testing: unit tests never touch the network.
#[test]
fn seed_writes_an_entry_of_every_storage_type() {
    let env = Env::default();
    let id = env.register(GuineaPig, ());
    let client = GuineaPigClient::new(&env, &id);

    client.seed(&42);

    assert_eq!(client.get_persistent(), Some(42));
    assert_eq!(client.get_temporary(), Some(42));
    assert_eq!(client.get_instance(), Some(42));
}

#[test]
fn reads_return_none_before_seeding() {
    let env = Env::default();
    let id = env.register(GuineaPig, ());
    let client = GuineaPigClient::new(&env, &id);

    assert_eq!(client.get_persistent(), None);
    assert_eq!(client.get_temporary(), None);
    assert_eq!(client.get_instance(), None);
}

#[test]
fn ping_identifies_the_contract() {
    let env = Env::default();
    let id = env.register(GuineaPig, ());
    let client = GuineaPigClient::new(&env, &id);

    assert_eq!(client.ping(), soroban_sdk::Symbol::new(&env, "guinea_pig"));
}

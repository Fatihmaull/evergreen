import { describe, expect, it } from 'vitest';
import { takeNetworkFlag } from '../src/network-args.js';

describe('takeNetworkFlag — --network is global (PH2-E1-03)', () => {
  it('lifts the flag out wherever it appears, leaving the command intact', () => {
    expect(takeNetworkFlag(['--network', 'mainnet', 'scan', 'C1', '--json'])).toEqual({
      network: 'mainnet',
      rest: ['scan', 'C1', '--json'],
    });
    expect(takeNetworkFlag(['scan', 'C1', '--network', 'testnet'])).toEqual({
      network: 'testnet',
      rest: ['scan', 'C1'],
    });
  });

  it('leaves argv untouched when there is no flag', () => {
    expect(takeNetworkFlag(['scan', 'C1'])).toEqual({ rest: ['scan', 'C1'] });
  });

  it('refuses a missing value, a flag as the value, and a repeat', () => {
    expect(takeNetworkFlag(['scan', 'C1', '--network']).error).toMatch(/needs a value/);
    expect(takeNetworkFlag(['scan', '--network', '--json']).error).toMatch(/needs a value/);
    expect(takeNetworkFlag(['--network', 'testnet', '--network', 'mainnet']).error).toMatch(
      /Repeated/,
    );
  });

  it('does not validate the name itself — that is core resolveNetwork', () => {
    expect(takeNetworkFlag(['--network', 'futurenet']).network).toBe('futurenet');
  });
});

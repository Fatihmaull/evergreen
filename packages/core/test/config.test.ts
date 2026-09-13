import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';

function config(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    defaults: { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400 },
    contracts: [{ id: A, label: 'guinea-pig-A', payer: 'bot-testnet' }],
    payers: { 'bot-testnet': { signer: 'ed25519', secretEnvVar: 'EVERGREEN_SIGNER_SECRET' } },
    ...over,
  });
}

describe('loadConfig — dry-run is the default, live is an opt-in', () => {
  it('defaults an omitted mode to dry-run', () => {
    expect(loadConfig(config()).config.mode).toBe('dry-run');
  });

  it('warns loudly when a config opts into live', () => {
    const { config: c, warnings } = loadConfig(config({ mode: 'live' }));
    expect(c.mode).toBe('live');
    expect(warnings.join('\n')).toContain('real transactions and real fees');
  });

  it('refuses a mode it does not recognise rather than guessing', () => {
    // Falling back to dry-run would be safe but silent; the typo stays hidden.
    expect(() => loadConfig(config({ mode: 'DRYRUN' }))).toThrow(ConfigError);
  });
});

describe('loadConfig — the network is compared, not trusted', () => {
  it('refuses a non-testnet passphrase and names what it found', () => {
    const bad = config({
      network: {
        rpcUrl: 'https://mainnet.example',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      },
    });
    expect(() => loadConfig(bad)).toThrow(/not Stellar testnet/);
  });

  it('accepts the exact testnet passphrase', () => {
    expect(loadConfig(config()).config.network.networkPassphrase).toBe(
      'Test SDF Network ; September 2015',
    );
  });
});

describe('loadConfig — secrets are named, never stored', () => {
  it('🔴 refuses a config containing a Stellar secret seed, wherever it sits', () => {
    const leaked = config({
      payers: {
        'bot-testnet': {
          signer: 'ed25519',
          secretEnvVar: 'SCXKG5JHUZW4WQKKZCXQPKMFZ5NBGT4YFHKAV6JVBUOFWH3ZLZ5RTFVM',
        },
      },
    });
    expect(() => loadConfig(leaked)).toThrow(/SECRET KEY/);
  });

  it('tells the user to rotate it, because a secret in a file is already leaked', () => {
    const leaked = config({
      _note: 'temp SCXKG5JHUZW4WQKKZCXQPKMFZ5NBGT4YFHKAV6JVBUOFWH3ZLZ5RTFVM remove me',
    });
    expect(() => loadConfig(leaked)).toThrow(/Rotate that key/);
  });

  it('PERMITS an env var name that merely starts with S', () => {
    // A guard that refuses everything is the testnet-guard failure again.
    expect(() =>
      loadConfig(
        config({
          payers: { 'bot-testnet': { signer: 'ed25519', secretEnvVar: 'STELLAR_SIGNER_SECRET' } },
        }),
      ),
    ).not.toThrow();
  });
});

describe('loadConfig — payer references resolve at the boundary', () => {
  it('🔴 refuses a contract pointing at an undefined payer, and lists the real ones', () => {
    const bad = config({ contracts: [{ id: A, payer: 'typo-payer' }] });
    expect(() => loadConfig(bad)).toThrow(/not defined in payers/);
    expect(() => loadConfig(bad)).toThrow(/bot-testnet/);
  });

  it('refuses the example placeholder rather than trying to scan it', () => {
    const bad = config({
      contracts: [{ id: 'REPLACE_WITH_GUINEA_PIG_A_ID', payer: 'bot-testnet' }],
    });
    expect(() => loadConfig(bad)).toThrow(/placeholder/);
  });
});

describe('loadConfig — the decay-proof guard', () => {
  it('🔴 warns when a contract is in BOTH contracts and _doNotWatch', () => {
    // Someone half-way through the add/dry-run/confirm procedure. That is
    // exactly when an unnoticed threshold mismatch destroys an unrepeatable proof.
    const { warnings } = loadConfig(
      config({
        contracts: [{ id: B, label: 'guinea-pig-B', payer: 'bot-testnet' }],
        _doNotWatch: [{ id: B, label: 'guinea-pig-B-natural-decay' }],
      }),
    );
    expect(warnings.join('\n')).toContain('BOTH');
    expect(warnings.join('\n')).toContain('cannot be recovered');
  });

  it('stays quiet when the decay subjects are only in _doNotWatch', () => {
    // The normal, safe arrangement must not produce noise, or the warning that
    // matters gets skimmed past.
    const { warnings } = loadConfig(config({ _doNotWatch: [{ id: B }] }));
    expect(warnings).toEqual([]);
  });
});

describe('loadConfig — documentation fields and error quality', () => {
  it('ignores underscore-prefixed documentation without complaint', () => {
    const { config: c } = loadConfig(config({ _README: ['notes'], _anything: 42 }));
    expect(c.contracts).toHaveLength(1);
  });

  it('reports malformed JSON in a way a human can act on', () => {
    expect(() => loadConfig('{ "network": }')).toThrow(/not valid JSON/);
    expect(() => loadConfig('{ "network": }')).toThrow(/trailing comma/);
  });

  it('names the exact path of a bad field', () => {
    expect(() =>
      loadConfig(config({ defaults: { bumpWhenRemainingLedgersBelow: -1, extendToLedgers: 1 } })),
    ).toThrow(/defaults\.bumpWhenRemainingLedgersBelow/);
  });

  it('never leaks a stack trace into its message', () => {
    try {
      loadConfig('not json at all');
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toMatch(/\n\s+at /);
    }
  });
});

describe('loadConfig — the shipped example is valid', () => {
  it('parses evergreen.config.example.json once its placeholders are filled', () => {
    // The example is what a stranger copies. If it does not load, the quickstart
    // is broken for everyone following the docs exactly.
    const raw = readFileSync(
      new URL('../../../evergreen.config.example.json', import.meta.url),
      'utf8',
    );
    const filled = raw
      .replace(/REPLACE_WITH_GUINEA_PIG_A_ID/g, A)
      .replace(/REPLACE_WITH_GUINEA_PIG_B_ID/g, B);
    const { config: c, warnings } = loadConfig(filled);
    expect(c.mode).toBe('dry-run');
    expect(c.contracts).toHaveLength(1);
    expect(warnings).toEqual([]);
  });
});

describe('loadConfig — the caller coverage declaration survives (ADR-006)', () => {
  it('carries an explicit dataKeys list through', () => {
    const { config: c } = loadConfig(
      config({ contracts: [{ id: A, payer: 'bot-testnet', dataKeys: ['AAAABg=='] }] }),
    );
    expect(c.contracts[0]?.dataKeys).toEqual(['AAAABg==']);
  });

  it('carries a no-data-keys declaration through', () => {
    // ADR-006 makes coverage part of the health answer. Dropping the
    // declaration would silently downgrade every configured scan to "unknown".
    const { config: c } = loadConfig(
      config({ contracts: [{ id: A, payer: 'bot-testnet', noDataKeys: true }] }),
    );
    expect(c.contracts[0]?.noDataKeys).toBe(true);
  });

  it('🔴 refuses a contract declaring no data keys while supplying some', () => {
    // The same contradiction the CLI rejects, caught once at the boundary
    // rather than on every run.
    expect(() =>
      loadConfig(
        config({
          contracts: [{ id: A, payer: 'bot-testnet', noDataKeys: true, dataKeys: ['AAAABg=='] }],
        }),
      ),
    ).toThrow(/cannot both be true/);
  });

  it('omits both fields when the config says nothing about coverage', () => {
    const { config: c } = loadConfig(config());
    expect(c.contracts[0]).not.toHaveProperty('dataKeys');
    expect(c.contracts[0]).not.toHaveProperty('noDataKeys');
  });
});

describe('loadConfig — warning/action policy (W3-D15-02)', () => {
  it('preserves a supplied warning in defaults and overrides', () => {
    const { config: c } = loadConfig(
      config({
        defaults: {
          warnBelowLedgers: 120960,
          bumpWhenRemainingLedgersBelow: 17280,
          extendToLedgers: 518400,
        },
        contracts: [
          {
            id: A,
            payer: 'bot-testnet',
            thresholds: { warnBelowLedgers: 60480, bumpWhenRemainingLedgersBelow: 8640 },
          },
        ],
      }),
    );
    expect(c.defaults).toHaveProperty('warnBelowLedgers', 120960);
    expect(c.contracts[0]?.thresholds).toHaveProperty('warnBelowLedgers', 60480);
  });
  it('does not materialize omitted warnings and lose their inheritance semantics', () => {
    const { config: c, warnings } = loadConfig(
      config({
        contracts: [
          { id: A, payer: 'bot-testnet', thresholds: { bumpWhenRemainingLedgersBelow: 1500000 } },
        ],
      }),
    );
    expect(c.defaults).not.toHaveProperty('warnBelowLedgers');
    expect(c.contracts[0]?.thresholds).not.toHaveProperty('warnBelowLedgers');
    expect(warnings.join(' ')).toMatch(/1500000/);
  });
  it('identifies an inverted effective pair at the contract path', () => {
    expect(() =>
      loadConfig(
        config({
          defaults: {
            warnBelowLedgers: 120960,
            bumpWhenRemainingLedgersBelow: 17280,
            extendToLedgers: 518400,
          },
          contracts: [
            { id: A, payer: 'bot-testnet', thresholds: { bumpWhenRemainingLedgersBelow: 1500000 } },
          ],
        }),
      ),
    ).toThrow(/contracts\[0\]\.thresholds/);
  });
  it('identifies an inverted default pair even when no contracts exist', () => {
    expect(() =>
      loadConfig(
        config({
          contracts: [],
          defaults: {
            warnBelowLedgers: 10,
            bumpWhenRemainingLedgersBelow: 20,
            extendToLedgers: 100,
          },
        }),
      ),
    ).toThrow(/defaults/);
  });
  it.each([null, [], 'warning', 123].map((value) => [value]))(
    'rejects a malformed thresholds object %j',
    (thresholds) => {
      expect(() =>
        loadConfig(config({ contracts: [{ id: A, payer: 'bot-testnet', thresholds }] })),
      ).toThrow(/contracts\[0\]\.thresholds/);
    },
  );
  it.each(['warnBelowLedger', 'criticalBelowLedgers', 'bumpWhenRemainingLedgerBelow'])(
    'rejects unknown threshold behavior %s instead of ignoring it',
    (key) => {
      expect(() =>
        loadConfig(
          config({
            defaults: { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400, [key]: 100 },
          }),
        ),
      ).toThrow(new RegExp(`defaults.${key}`));
      expect(() =>
        loadConfig(
          config({ contracts: [{ id: A, payer: 'bot-testnet', thresholds: { [key]: 100 } }] }),
        ),
      ).toThrow(new RegExp(`contracts\\[0\\].thresholds.${key}`));
    },
  );
  it.each([-1, 1.5, null, '120960', Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid warning config %j',
    (warnBelowLedgers) => {
      expect(() =>
        loadConfig(
          config({
            defaults: {
              warnBelowLedgers,
              bumpWhenRemainingLedgersBelow: 17280,
              extendToLedgers: 518400,
            },
          }),
        ),
      ).toThrow(/defaults.warnBelowLedgers/);
    },
  );
  it('accepts threshold documentation and an explicit equal pair', () => {
    const { config: c } = loadConfig(
      config({
        defaults: {
          _why: 'notes',
          warnBelowLedgers: 17280,
          bumpWhenRemainingLedgersBelow: 17280,
          extendToLedgers: 518400,
        },
        contracts: [
          {
            id: A,
            payer: 'bot-testnet',
            thresholds: { _why: 'notes', warnBelowLedgers: 0, bumpWhenRemainingLedgersBelow: 0 },
          },
        ],
      }),
    );
    expect(c.contracts[0]?.thresholds).toEqual({
      warnBelowLedgers: 0,
      bumpWhenRemainingLedgersBelow: 0,
    });
  });
});

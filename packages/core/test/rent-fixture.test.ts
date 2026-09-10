import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FIXTURE = new URL('./fixtures/extendTTL-fees-guinea-pig-a.json', import.meta.url).pathname;

interface ExtendRecord {
  readonly kind: 'instance' | 'persistent' | 'temporary';
  readonly durability: 'persistent' | 'temporary';
  readonly txHash: string;
  readonly entryDataBytes: number;
  readonly ledgerKeyBytes: number;
  readonly liveUntilBefore: number;
  readonly liveUntilAfter: number;
  readonly ledgersExtended: number;
  readonly rentFeeCharged: number;
  readonly nonRefundableResourceFeeCharged: number;
  readonly feeCharged: number;
}

function load(): ExtendRecord[] {
  return (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { extends: ExtendRecord[] }).extends;
}

function byKind(kind: ExtendRecord['kind']): ExtendRecord {
  const found = load().find((e) => e.kind === kind);
  if (found === undefined) throw new Error(`fixture is missing the ${kind} extend`);
  return found;
}

/**
 * `W2-D9-02` validates the rent estimate against a real testnet fee. These are the
 * facts it validates against — three measured `ExtendFootprintTTLOp` transactions
 * recorded during `W1-D7-08`.
 *
 * This file deliberately asserts *relationships*, not a formula. Three data points
 * cannot determine a cost model, and a test that pinned one would manufacture
 * confidence rather than measure it. What it does guarantee is that the recorded
 * numbers stay internally consistent, so `W2-D9-02` cannot be validated against a
 * fixture that has quietly been tidied.
 */
describe('extendTTL fee fixture — the anchor for the rent model', () => {
  it('records rent isolated from the rest of the fee, not fee_charged as a proxy', () => {
    for (const e of load()) {
      // fee_charged bundles base fee + non-refundable resource fee + rent. A model
      // validated against fee_charged would look accurate while being wrong about
      // the only component it actually predicts.
      expect(e.rentFeeCharged).toBeLessThan(e.feeCharged);
      expect(e.rentFeeCharged + e.nonRefundableResourceFeeCharged).toBeLessThanOrEqual(
        e.feeCharged,
      );
    }
  });

  it('every extend actually moved the entry, by the amount recorded', () => {
    for (const e of load()) {
      expect(e.liveUntilAfter).toBeGreaterThan(e.liveUntilBefore);
      expect(e.liveUntilAfter - e.liveUntilBefore).toBe(e.ledgersExtended);
    }
  });

  /**
   * The load-bearing observation. The persistent and temporary entries are
   * byte-for-byte identical and were extended by the same number of ledgers to
   * within two — so durability is the only variable, and it roughly doubles the
   * bill. This is what upgrades `W2-D12-01` from "this entry is oversized" to
   * "moving this to temporary storage halves its rent".
   */
  it('durability class is a first-order price term at identical size', () => {
    const persistent = byKind('persistent');
    const temporary = byKind('temporary');

    expect(persistent.entryDataBytes).toBe(temporary.entryDataBytes);
    expect(persistent.ledgerKeyBytes).toBe(temporary.ledgerKeyBytes);
    expect(Math.abs(persistent.ledgersExtended - temporary.ledgersExtended)).toBeLessThan(10);

    const ratio = persistent.rentFeeCharged / temporary.rentFeeCharged;
    expect(ratio).toBeGreaterThan(1.8);
    expect(ratio).toBeLessThan(2.1);
  });

  it('rent dominates an extend-only transaction, so the flat component is not the story', () => {
    for (const e of load()) {
      expect(e.rentFeeCharged / e.feeCharged).toBeGreaterThan(0.95);
    }
    // ...but it is genuinely flat, which is why it stops mattering at scale and
    // starts mattering on a tiny extend.
    const flat = load().map((e) => e.nonRefundableResourceFeeCharged);
    expect(Math.max(...flat) - Math.min(...flat)).toBeLessThan(500);
  });

  /**
   * Guard against a plausible wrong model. Rent is *not* proportional to total
   * bytes: the instance entry is 1.12x the persistent entry's key+data and costs
   * 1.49x. Anyone fitting a stroops-per-byte-per-ledger constant to these three
   * points will match them and be wrong elsewhere — the fixture says so, and this
   * asserts the discrepancy is real rather than a rounding artefact.
   */
  it('rent is not linear in total bytes — three points do not give a coefficient', () => {
    const instance = byKind('instance');
    const persistent = byKind('persistent');

    const sizeRatio =
      (instance.entryDataBytes + instance.ledgerKeyBytes) /
      (persistent.entryDataBytes + persistent.ledgerKeyBytes);
    const rentRatio = instance.rentFeeCharged / persistent.rentFeeCharged;

    expect(rentRatio / sizeRatio).toBeGreaterThan(1.2);
  });
});

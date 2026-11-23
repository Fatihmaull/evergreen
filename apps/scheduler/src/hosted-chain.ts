/**
 * Stage 2 of PH2-E4-04: the chain side of one hosted job, the `HostedChain` port of the money
 * path (PH2-E4-02). **Testnet only.** One engine account signs everything (design §5), so the
 * caller runs jobs one after another, never in parallel.
 *
 * - `pull`: SEP-41 `transfer_from(spender = engine, from = payer, to = engine, amount)` on the
 *   native XLM SAC, under the allowance the payer approved (ADR-007).
 * - `extend`: `ExtendFootprintTTL` over the item's entries, paid by the engine from the pull.
 *   The rent it reports is the meta's `rentFeeCharged`, never the declared fee (#382).
 * - `refund`: a classic native payment engine → payer.
 *
 * **Idempotency (review of #630, P2.1).** SEP-41 has no idempotency key, so each step records its
 * transaction hash and `maxTime` in the 0006 columns **before** sending. A later call for the same
 * step asks the chain about that hash first:
 * - SUCCESS: the step happened; it is returned as confirmed and nothing new is sent;
 * - FAILED: for `pull` and `refund` nothing moved, so a new transaction is built; for `extend` the
 *   failure is the outcome (non-transient);
 * - NOT_FOUND before `maxTime` + grace: uncertain, so it throws and the next tick asks again;
 * - NOT_FOUND after: it can never be included, so a new transaction is built.
 * A transaction the RPC rejects on send (`ERROR`, `TRY_AGAIN_LATER`) never reached a ledger, so
 * its record is cleared.
 *
 * Nothing here logs. Errors carry codes, never an account or a key.
 */
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  SorobanDataBuilder,
  StrKey,
  TransactionBuilder,
  type Transaction,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { NETWORKS } from '@evergreen-stellar/core';
import type { ConfirmedMove, ExtendMove, HostedChain } from '@evergreen/engine/dist/money-path.js';
import type { SubmitStep, SubmittedStore } from './hosted-store.js';

/** The RPC calls this port makes. `rpc.Server` satisfies it; tests pass a fake. */
export interface ChainRpc {
  getAccount(address: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
  prepareTransaction(tx: Transaction): Promise<Transaction>;
  sendTransaction(tx: Transaction): Promise<{ status: string; hash: string }>;
  getTransaction(hash: string): Promise<{
    status: string;
    resultXdr?: { toXdrObject(): unknown };
    resultMetaXdr?: { toXdrObject(): unknown };
    /**
     * Envelope of a confirmed transaction. The RPC object has `toXDR`; tests may
     * pass the base64 string.
     */
    envelopeXdr?: string | { toXDR(encoding: 'base64'): string };
  }>;
}

export class ChainStepError extends Error {
  constructor(
    readonly code:
      'STEP_UNCERTAIN' | 'STEP_REJECTED' | 'STEP_FAILED' | 'SIMULATION_FAILED' | 'BAD_RESULT',
  ) {
    super(code);
    this.name = 'ChainStepError';
  }
}

export interface HostedChainOptions {
  readonly rpc: ChainRpc;
  readonly engine: Keypair;
  readonly payerAccount: string;
  /** Base64 `LedgerKey`s of the entries to extend, all owned by the job's contract. */
  readonly entryKeys: readonly string[];
  /** `extendTo` for `ExtendFootprintTTL`, already capped at the network's max entry TTL. */
  readonly extendToLedgers: number;
  readonly submitted: SubmittedStore;
  /** Unix seconds. */
  readonly now?: () => number;
  /** Polls of `getTransaction` after a send, one second apart. */
  readonly confirmAttempts?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  /** Rent quote for the entries; the default simulates through `rpc`. */
  readonly quoteRent?: () => Promise<bigint>;
}

/**
 * The `transfer_from` amount on a pull envelope. A resumed SUCCESS has to report
 * this, not a later estimate. Returns undefined when the envelope is missing or
 * is not that invoke.
 */
export function pullAmountFromEnvelope(envelopeXdr: string | undefined): bigint | undefined {
  if (envelopeXdr === undefined || envelopeXdr === '') return undefined;
  try {
    const parsed = TransactionBuilder.fromXDR(envelopeXdr, PASSPHRASE);
    if (!('operations' in parsed)) return undefined;
    const op = parsed.operations[0];
    if (op === undefined || op.type !== 'invokeHostFunction') return undefined;
    // The SDK's parsed host function JSON-serialises the amount as `"i128":"<digits>"`.
    // Reading the field directly is a BigNumber-like object whose String() is not the digits.
    const invoke = op.func as { invokeContract?: { args?: readonly unknown[] } };
    const dumped = JSON.stringify(invoke.invokeContract?.args?.at(-1));
    const digits = dumped?.match(/"i128":"(\d+)"/)?.[1];
    if (digits === undefined) return undefined;
    const value = BigInt(digits);
    if (value <= 0n) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

/** Seconds a transaction may wait for inclusion. */
export const TX_TIMEOUT_SECONDS = 60;
/** Seconds after `maxTime` before a NOT_FOUND hash is treated as never included. */
export const EXPIRY_GRACE_SECONDS = 30;
const INCLUSION_FEE = '1000';

const PASSPHRASE = NETWORKS.testnet.passphrase;
export const NATIVE_SAC = Asset.native().contractId(PASSPHRASE);

/** Depth-first search of an XDR wire object for a bigint field. */
export function findBigint(value: unknown, field: string): bigint | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findBigint(item, field);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const direct = record[field];
  if (typeof direct === 'bigint') return direct;
  for (const key of Object.keys(record)) {
    const found = findBigint(record[key], field);
    if (found !== undefined) return found;
  }
  return undefined;
}

interface Included {
  readonly status: 'SUCCESS' | 'FAILED';
  readonly hash: string;
  readonly feeDeclaredStroops: bigint;
  readonly feeChargedStroops: bigint;
  readonly meta: unknown;
}

function included(
  hash: string,
  declared: bigint,
  response: Awaited<ReturnType<ChainRpc['getTransaction']>>,
): Included {
  const result = response.resultXdr?.toXdrObject();
  const charged = findBigint(result, 'feeCharged');
  if (charged === undefined || charged < 0n) throw new ChainStepError('BAD_RESULT');
  return {
    status: response.status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
    hash,
    feeDeclaredStroops: declared,
    feeChargedStroops: charged,
    meta: response.resultMetaXdr?.toXdrObject(),
  };
}

export function createHostedChain(options: HostedChainOptions): HostedChain {
  const { rpc: server, engine, payerAccount, submitted } = options;
  const now = options.now ?? (() => Math.floor(Date.now() / 1000));
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const attempts = options.confirmAttempts ?? 15;
  const enginePublic = engine.publicKey();
  if (!StrKey.isValidEd25519PublicKey(payerAccount) || payerAccount === enginePublic)
    throw new ChainStepError('STEP_REJECTED');
  if (options.entryKeys.length === 0 || !Number.isSafeInteger(options.extendToLedgers))
    throw new ChainStepError('STEP_REJECTED');
  const sac = new Contract(NATIVE_SAC);

  async function poll(hash: string, declared: bigint): Promise<Included | null> {
    for (let i = 0; i < attempts; i += 1) {
      const response = await server.getTransaction(hash);
      if (response.status === 'SUCCESS' || response.status === 'FAILED')
        return included(hash, declared, response);
      if (response.status !== 'NOT_FOUND') throw new ChainStepError('BAD_RESULT');
      if (i + 1 < attempts) await sleep(1000);
    }
    return null;
  }

  /**
   * One step, at most once. Returns the included transaction, or throws: STEP_UNCERTAIN when the
   * outcome is not known yet, STEP_REJECTED when the RPC refused the send (nothing happened).
   */
  async function step(
    name: SubmitStep,
    build: () => Promise<Transaction>,
    rebuildOnFailed: boolean,
    amountStroops?: bigint,
  ): Promise<Included> {
    const prior = await submitted.read(name);
    if (prior !== null) {
      const response = await server.getTransaction(prior.hash);
      if (response.status === 'SUCCESS' || (response.status === 'FAILED' && !rebuildOnFailed))
        return included(prior.hash, 0n, response);
      if (response.status === 'NOT_FOUND' && now() <= prior.expiresAt + EXPIRY_GRACE_SECONDS)
        throw new ChainStepError('STEP_UNCERTAIN');
      if (response.status !== 'NOT_FOUND' && response.status !== 'FAILED')
        throw new ChainStepError('BAD_RESULT');
      await submitted.clear(name);
    }
    const tx = await build();
    tx.sign(engine);
    const hash = hex(tx.hash());
    const maxTime = Number(tx.timeBounds?.maxTime ?? '0');
    if (!Number.isSafeInteger(maxTime) || maxTime <= 0) throw new ChainStepError('BAD_RESULT');
    await submitted.record(name, {
      hash,
      expiresAt: maxTime,
      ...(amountStroops === undefined ? {} : { amountStroops }),
    });
    const sent = await server.sendTransaction(tx);
    if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
      await submitted.clear(name);
      throw new ChainStepError('STEP_REJECTED');
    }
    if (sent.hash !== hash) throw new ChainStepError('BAD_RESULT');
    const done = await poll(hash, BigInt(tx.fee));
    if (done === null) throw new ChainStepError('STEP_UNCERTAIN');
    return done;
  }

  async function engineTx(): Promise<TransactionBuilder> {
    const account = await server.getAccount(enginePublic);
    return new TransactionBuilder(new Account(enginePublic, account.sequenceNumber()), {
      fee: INCLUSION_FEE,
      networkPassphrase: PASSPHRASE,
    });
  }

  async function readSac(method: string, args: xdr.ScVal[]): Promise<bigint> {
    // A read: simulated, never signed or sent. The source only needs to be a valid key.
    const tx = new TransactionBuilder(new Account(enginePublic, '0'), {
      fee: INCLUSION_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(sac.call(method, ...args))
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(sim) || sim.result === undefined)
      throw new ChainStepError('SIMULATION_FAILED');
    const value: unknown = scValToNative(sim.result.retval);
    if (typeof value !== 'bigint' || value < 0n) throw new ChainStepError('BAD_RESULT');
    return value;
  }

  const addr = (g: string): xdr.ScVal => new Address(g).toScVal();

  function extendTx(builder: TransactionBuilder): Transaction {
    return builder
      .addOperation(Operation.extendFootprintTtl({ extendTo: options.extendToLedgers }))
      .setSorobanData(
        new SorobanDataBuilder()
          .setReadOnly(options.entryKeys.map((k) => xdr.LedgerKey.fromXDR(k, 'base64')))
          .build(),
      )
      .setTimeout(TX_TIMEOUT_SECONDS)
      .build();
  }

  const moved = (done: Included): ConfirmedMove => ({
    hash: done.hash,
    feeDeclaredStroops: done.feeDeclaredStroops,
    feeChargedStroops: done.feeChargedStroops,
  });

  return {
    async simulateRent() {
      try {
        if (options.quoteRent !== undefined) return await options.quoteRent();
        const sim = await server.simulateTransaction(
          extendTx(
            new TransactionBuilder(new Account(enginePublic, '0'), {
              fee: INCLUSION_FEE,
              networkPassphrase: PASSPHRASE,
            }),
          ),
        );
        if (!rpc.Api.isSimulationSuccess(sim) || 'restorePreamble' in sim) return undefined;
        // The simulated resource fee is rent plus a small fixed part, so this errs high:
        // the excess comes back as a refund at reconcile.
        return BigInt(sim.minResourceFee);
      } catch {
        return undefined;
      }
    },
    allowanceRemaining: () => readSac('allowance', [addr(payerAccount), addr(enginePublic)]),
    balance: () => readSac('balance', [addr(payerAccount)]),
    async pull(amount) {
      const prior = await submitted.read('pull');
      if (prior !== null) {
        const response = await server.getTransaction(prior.hash);
        if (response.status === 'SUCCESS') {
          const envelope =
            typeof response.envelopeXdr === 'string'
              ? response.envelopeXdr
              : response.envelopeXdr?.toXDR('base64');
          const landed = prior.amountStroops ?? pullAmountFromEnvelope(envelope);
          if (landed === undefined) throw new ChainStepError('BAD_RESULT');
          return { ...moved(included(prior.hash, 0n, response)), amountStroops: landed };
        }
        if (response.status === 'NOT_FOUND' && now() <= prior.expiresAt + EXPIRY_GRACE_SECONDS)
          throw new ChainStepError('STEP_UNCERTAIN');
        if (response.status !== 'NOT_FOUND' && response.status !== 'FAILED')
          throw new ChainStepError('BAD_RESULT');
        await submitted.clear('pull');
        // Nothing moved. `amount <= 0` means "resolve only": the caller preflights
        // before building a replacement.
        if (amount <= 0n) throw new ChainStepError('STEP_FAILED');
      } else if (amount <= 0n) {
        throw new ChainStepError('STEP_REJECTED');
      }
      const done = await step(
        'pull',
        async () =>
          server.prepareTransaction(
            (await engineTx())
              .addOperation(
                sac.call(
                  'transfer_from',
                  addr(enginePublic),
                  addr(payerAccount),
                  addr(enginePublic),
                  nativeToScVal(amount, { type: 'i128' }),
                ),
              )
              .setTimeout(TX_TIMEOUT_SECONDS)
              .build(),
          ),
        true,
        amount,
      );
      if (done.status !== 'SUCCESS') throw new ChainStepError('STEP_FAILED');
      return { ...moved(done), amountStroops: amount };
    },
    async extend(): Promise<ExtendMove> {
      // A send the RPC refused, or an outcome not known yet, throws: the job stays `pulled` and
      // the next tick tries again. Only an included transaction is an outcome.
      const done = await step(
        'extend',
        async () => server.prepareTransaction(extendTx(await engineTx())),
        false,
      );
      const rent = done.status === 'SUCCESS' ? findBigint(done.meta, 'rentFeeCharged') : 0n;
      if (rent === undefined || rent < 0n || rent > done.feeChargedStroops)
        throw new ChainStepError('BAD_RESULT');
      // `feeCharged` includes `rentFeeCharged`. The rent is its own ledger row, so the
      // network-fee evidence is the rest. Otherwise fee_ledger_job_subsidy flags every job.
      return {
        ...moved(done),
        feeChargedStroops: done.feeChargedStroops - rent,
        succeeded: done.status === 'SUCCESS',
        transient: false,
        chargedRentStroops: rent,
      };
    },
    async refund(amount) {
      if (amount <= 0n) throw new ChainStepError('STEP_REJECTED');
      const done = await step(
        'refund',
        async () =>
          (await engineTx())
            .addOperation(
              Operation.payment({
                destination: payerAccount,
                asset: Asset.native(),
                amount: stroopsToXlm(amount),
              }),
            )
            .setTimeout(TX_TIMEOUT_SECONDS)
            .build(),
        true,
      );
      if (done.status !== 'SUCCESS') throw new ChainStepError('STEP_FAILED');
      return moved(done);
    },
  };
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Stroops as the 7-decimal XLM string a classic payment takes. */
export function stroopsToXlm(stroops: bigint): string {
  if (stroops < 0n) throw new RangeError('negative amount');
  const whole = stroops / 10_000_000n;
  const frac = (stroops % 10_000_000n).toString().padStart(7, '0');
  return `${whole}.${frac}`;
}

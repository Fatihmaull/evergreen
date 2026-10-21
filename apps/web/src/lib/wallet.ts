/**
 * The wallet-connect primitive: connect, the network guard, typed failures and
 * `signTransaction`. Nothing else (#327).
 *
 * THIS MODULE NEVER SUBMITS. Simulate → submit → read back is
 * `lib/wallet-money.ts` (WEBR), and the login bundle may not contain it:
 * `build.mjs` lists it in `LOGIN_FORBIDDEN` and `--commission` proves the
 * refusal both ways. ADR-008: an email session never appears able to move
 * money, and a submit path nobody calls is still a submit path in the bundle.
 *
 * NO COPY AND NO FORMATTING. It returns a typed failure; the screen writes the
 * sentence, so the never-appears list in `claims-and-copy.md` is reviewed in
 * one place, the screens.
 *
 * ONE PASSPHRASE. Every comparison is against `NETWORK.passphrase` from
 * `lib/network.ts` — the same value `verifiedServer()` checks (#345). No
 * literal here.
 *
 * How each kind arises from `@stellar/freighter-api` 6.0.1 — READ FROM THE
 * SOURCE (stellar/freighter @ b1e795c), NOT OBSERVED IN A WALLET. Rakha asked
 * for this record on #327; #320 only exercised an unlocked wallet.
 *
 *   not-installed   `isConnected()` → `{ isConnected: false }`
 *   not-connected   `requestAccess()` / `getAddress()` → `address: ''`
 *   locked          UNDETERMINED. The extension's locked error is code -1, the
 *                   same code as its internal error, and is only returned by
 *                   `disconnect`. A locked wallet's `getAddress()` returns an
 *                   empty address, the same as an unconnected one. So the
 *                   adapter cannot tell `locked` from `not-connected` and does
 *                   not produce `locked`; the kind stays so a screen handles it
 *                   the day a wallet can report it.
 *   wrong-network   `getNetworkDetails().networkPassphrase` ≠ `NETWORK.passphrase`
 *   account-mismatch `getAddress()` or the returned `signerAddress` ≠ the
 *                   address the caller expects
 *   rejected        `error.code === -4` (`FreighterApiDeclinedError`). Closing
 *                   the popup returns the same error.
 *   timeout         our deadline passed with the prompt still open
 *   unavailable     any other `error`, or a throw; carries its detail
 */
import { NETWORK } from './network';

export type WalletFailure =
  | { kind: 'not-installed' }
  | { kind: 'locked' }
  | { kind: 'not-connected' }
  | { kind: 'wrong-network'; reported: string }
  | { kind: 'account-mismatch'; expected: string; reported: string }
  | { kind: 'rejected' } // the user said no — NOT a failure to retry
  | { kind: 'timeout' } // our deadline, not the wallet's refusal
  | { kind: 'unavailable'; detail: string };

/** Freighter's error shape (`@shared/api/types` `FreighterApiError`). */
interface PortError {
  code: number;
  message: string;
}
type Reply<T> = Promise<T & { error?: PortError }>;

/** The subset of `@stellar/freighter-api` this module uses, so tests can stand in. */
export interface WalletPort {
  isConnected(): Reply<{ isConnected: boolean }>;
  requestAccess(): Reply<{ address: string }>;
  getAddress(): Reply<{ address: string }>;
  getNetworkDetails(): Reply<{ networkPassphrase: string }>;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ): Reply<{ signedTxXdr: string; signerAddress: string }>;
}

/** `FreighterApiDeclinedError.code` in stellar/freighter `@shared/api/helpers/extensionMessaging.ts`. */
export const DECLINED_CODE = -4;

/** How long a prompt may stay open. A default, not a measurement. */
export const DEFAULT_TIMEOUT_MS = 120_000;

export function isWalletFailure(value: unknown): value is WalletFailure {
  return typeof value === 'object' && value !== null && 'kind' in value;
}

const TIMED_OUT = Symbol('timeout');

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

function fromError(error: PortError): WalletFailure {
  return error.code === DECLINED_CODE
    ? { kind: 'rejected' }
    : { kind: 'unavailable', detail: `${error.code}: ${error.message}` };
}

/** One call to the port: deadline, throw and error-field handling in one place. */
async function call<T>(
  work: () => Reply<T>,
  ms: number,
): Promise<{ ok: T } | { failed: WalletFailure }> {
  let reply: (T & { error?: PortError }) | typeof TIMED_OUT;
  try {
    reply = await withDeadline(work(), ms);
  } catch (error) {
    return { failed: { kind: 'unavailable', detail: (error as Error).message ?? String(error) } };
  }
  if (reply === TIMED_OUT) return { failed: { kind: 'timeout' } };
  if (reply.error) return { failed: fromError(reply.error) };
  return { ok: reply };
}

export interface Wallet {
  connect(): Promise<{ account: string } | WalletFailure>;
  assertTestnet(): Promise<true | WalletFailure>;
  signTransaction(
    xdr: string,
    opts: { networkPassphrase: string; address: string },
  ): Promise<{ signedXdr: string } | WalletFailure>;
}

export function createWallet(
  port: WalletPort,
  { timeoutMs = DEFAULT_TIMEOUT_MS }: { timeoutMs?: number } = {},
): Wallet {
  async function installed(): Promise<true | WalletFailure> {
    const r = await call(() => port.isConnected(), timeoutMs);
    if ('failed' in r) return r.failed;
    return r.ok.isConnected ? true : { kind: 'not-installed' };
  }

  async function onTestnet(): Promise<true | WalletFailure> {
    const r = await call(() => port.getNetworkDetails(), timeoutMs);
    if ('failed' in r) return r.failed;
    return r.ok.networkPassphrase === NETWORK.passphrase
      ? true
      : { kind: 'wrong-network', reported: r.ok.networkPassphrase };
  }

  return {
    async connect() {
      const present = await installed();
      if (present !== true) return present;
      const r = await call(() => port.requestAccess(), timeoutMs);
      if ('failed' in r) return r.failed;
      return r.ok.address ? { account: r.ok.address } : { kind: 'not-connected' };
    },

    async assertTestnet() {
      const present = await installed();
      if (present !== true) return present;
      return onTestnet();
    },

    /**
     * Checks network and account in the same call that signs (Rakha, #327), so
     * a switch after `assertTestnet()` cannot slip through. Freighter is also
     * given both, and the returned signer is checked again: three looks, because
     * the wallet's state can change while its prompt is open.
     */
    async signTransaction(xdr, opts) {
      if (opts.networkPassphrase !== NETWORK.passphrase) {
        return { kind: 'wrong-network', reported: opts.networkPassphrase };
      }
      const present = await installed();
      if (present !== true) return present;
      const network = await onTestnet();
      if (network !== true) return network;
      const who = await call(() => port.getAddress(), timeoutMs);
      if ('failed' in who) return who.failed;
      if (!who.ok.address) return { kind: 'not-connected' };
      if (who.ok.address !== opts.address) {
        return { kind: 'account-mismatch', expected: opts.address, reported: who.ok.address };
      }
      const signed = await call(
        () =>
          port.signTransaction(xdr, {
            networkPassphrase: NETWORK.passphrase,
            address: opts.address,
          }),
        timeoutMs,
      );
      if ('failed' in signed) return signed.failed;
      if (signed.ok.signerAddress !== opts.address) {
        return {
          kind: 'account-mismatch',
          expected: opts.address,
          reported: signed.ok.signerAddress,
        };
      }
      if (!signed.ok.signedTxXdr) return { kind: 'unavailable', detail: 'empty signed XDR' };
      return { signedXdr: signed.ok.signedTxXdr };
    },
  };
}

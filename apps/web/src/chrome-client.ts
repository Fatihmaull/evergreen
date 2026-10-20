/**
 * The only script the shell loads on every page: fill in the live ledger in
 * the status bar. No SDK, no core, nothing signed.
 *
 * TWO READS, not one, and the first is the network. A URL that says testnet
 * proves nothing about what it serves, and this script runs on every page of a
 * site whose footer says "Testnet only. Read-only: these pages never sign or
 * submit anything." A ledger number from another network rendered under that
 * sentence is the product's own failure mode — a confident figure with nothing
 * behind it. Rakha found the gap on #345.
 *
 * The URL and the expected passphrase arrive as `define`d literals rather than
 * through `lib/network.ts`, which would pull `resolveNetwork` and core's
 * network table into this bundle: that took it from 495 B to 1.3 KB, and made
 * the first line of this comment false. `build.mjs` reads both from
 * `packages/core/src/networks.ts` and refuses if that file moves, so there is
 * still no passphrase typed anywhere in `apps/`.
 */
declare const __EVERGREEN_RPC_URL__: string;
declare const __EVERGREEN_PASSPHRASE__: string;

const RPC_URL = typeof __EVERGREEN_RPC_URL__ === 'undefined' ? '' : __EVERGREEN_RPC_URL__;
const PASSPHRASE = typeof __EVERGREEN_PASSPHRASE__ === 'undefined' ? '' : __EVERGREEN_PASSPHRASE__;

async function call(method: string): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method }),
  });
  return ((await response.json()) as { result?: unknown }).result;
}

async function fillLiveLedger(): Promise<void> {
  const slot = document.querySelector('[data-live-ledger]');
  if (!slot) return;
  try {
    const network = (await call('getNetwork')) as { passphrase?: string } | undefined;
    if (network?.passphrase !== PASSPHRASE) {
      // Say which failure this is. "unavailable" would read as a flaky RPC and
      // send someone looking in the wrong place for an afternoon.
      slot.textContent = 'wrong network';
      return;
    }
    const health = (await call('getHealth')) as { latestLedger?: number } | undefined;
    const latest = health?.latestLedger;
    if (typeof latest !== 'number') throw new Error('no latestLedger in response');
    slot.textContent = latest.toLocaleString('en-US');
  } catch {
    slot.textContent = 'unavailable';
  }
}

void fillLiveLedger();

/**
 * The only script the shell loads on every page: fill in the live ledger in
 * the status bar. A single `getHealth` read — no SDK, no core, nothing signed.
 * If it fails the bar says so; the page content is unaffected.
 */
const RPC_URL = 'https://soroban-testnet.stellar.org';

async function fillLiveLedger(): Promise<void> {
  const slot = document.querySelector('[data-live-ledger]');
  if (!slot) return;
  try {
    const response = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'live-ledger', method: 'getHealth' }),
    });
    const body = (await response.json()) as { result?: { latestLedger?: number } };
    const latest = body.result?.latestLedger;
    if (typeof latest === 'number') {
      slot.textContent = latest.toLocaleString('en-US');
      return;
    }
    throw new Error('no latestLedger in response');
  } catch {
    slot.textContent = 'unavailable';
  }
}

void fillLiveLedger();

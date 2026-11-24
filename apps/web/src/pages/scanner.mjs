/**
 * /dashboard/scanner/ — Scanner (components.md § "Dashboard revamp",
 * Scanner). One input row, data keys folded away, then the binding expiry as
 * the dominant figure with Add to watchlist and Copy CLI command, then the
 * entries read. No example contract is offered.
 */
export const meta = {
  title: 'Scanner — Evergreen',
  description:
    'Scan one Soroban testnet contract for the entry that binds its expiry, every entry read, and what extending costs. No wallet, no signup.',
  active: '/dashboard/scanner/',
  eyebrow: 'Scanner · Stellar testnet',
  heading: 'Scan a contract',
  script: '/assets/scanner.js',
  bare: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Scanner · Stellar testnet</p>
        <h1>Scan a contract</h1>
      </div>
    </div>
    <form class="stack" id="scan-form">
      <div class="scan-row">
        <label class="skip" for="contract-id">Contract ID</label>
        <input id="contract-id" class="search wide mono" type="text" spellcheck="false" autocomplete="off" placeholder="Paste a testnet contract ID, C…" />
        <button id="scan-button" type="submit">Scan</button>
      </div>
      <details>
        <summary>Data keys (optional)</summary>
        <p class="note">Storage cannot be listed: a scan reads the keys it is given. One base64 <span class="mono">LedgerKey</span> per line, as the CLI's <span class="mono">--keys-file</span>.</p>
        <textarea id="data-keys" spellcheck="false" placeholder="AAAABgAAAAE…"></textarea>
      </details>
    </form>
    <div id="result" aria-live="polite"></div>`;
}

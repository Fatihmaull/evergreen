/** /dashboard/scanner/ — single-contract scan console. */
export const meta = {
  title: 'Contract scanner — Evergreen',
  description:
    'Scan one Soroban testnet contract for TTL health, the entry that binds its expiry, and a rent estimate. Read-only.',
  active: '/dashboard/scanner/',
  eyebrow: 'Contract scanner · Stellar testnet',
  heading: 'Scan one contract',
  lead: 'A permissionless read: TTL health, which entry expires first, and what extending costs — priced by simulating against the network. A single-contract scan cannot settle whether the code entry is shared; that reads undetermined, with a link into Blast Radius.',
  script: '/assets/scanner.js',
};

export function render() {
  return `<section>
      <form class="card card-pad stack" id="scan-form">
        <div>
          <label class="field-label" for="contract-id">Testnet contract address</label>
          <input id="contract-id" type="text" spellcheck="false" autocomplete="off" placeholder="C…" />
        </div>
        <div class="row">
          <button id="scan-button" type="submit">Scan</button>
          <button id="example-button" class="secondary" type="button">Use guinea-pig A</button>
          <span class="small muted">Checking several contracts that share a Wasm? <a href="/dashboard/blast-radius/">Use Blast Radius</a>.</span>
        </div>
        <details>
          <summary>Data keys — optional, and what they change</summary>
          <p class="small muted">
            Contract storage cannot be enumerated: a scan reads the keys it is handed. Without any, only the instance
            and code entries are visible, and the result says so. One base64 <span class="mono">LedgerKey</span> per
            line — the same values the CLI takes in <span class="mono">--keys-file</span>.
          </p>
          <textarea id="data-keys" spellcheck="false" placeholder="AAAABgAAAAE…"></textarea>
        </details>
      </form>
    </section>
    <section><div id="result" aria-live="polite"></div></section>
    <section>
      <h2 class="section">Reading the result</h2>
      <p class="muted">
        The verdict names the entry that expires first — a contract stops working when its earliest entry does,
        and that is rarely the instance. A clean scan means everything asked-for is healthy, never that the
        contract is fully healthy: coverage travels with the verdict. Exit codes and flags are on
        <a href="/docs/">the CLI reference</a>.
      </p>
    </section>`;
}

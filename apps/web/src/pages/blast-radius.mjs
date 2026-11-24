/** /dashboard/blast-radius/ — multi-contract dependency graph. */
export const meta = {
  title: 'Blast Radius — Evergreen',
  description:
    'Contracts built from the same Wasm share one code entry. Scan them together to see what fails with it.',
  active: '/dashboard/blast-radius/',
  eyebrow: 'Blast Radius · Stellar testnet',
  heading: 'One entry. Every contract built from that Wasm.',
  lead: 'Contracts built from the same Wasm share one code entry. A scan of one contract cannot see the others, so it says undetermined. Give it all of them and it can answer — as a lower bound: contracts you did not list may also depend on that entry.',
  script: '/assets/blast-radius.js',
};

export function render() {
  return `<section>
      <form class="card card-pad stack" id="form">
        <div>
          <label class="field-label" for="ids">Contract addresses — one per line</label>
          <textarea id="ids" spellcheck="false" placeholder="C…&#10;C…"></textarea>
        </div>
        <div class="row">
          <button id="scan-button" type="submit">Scan together</button>
          <button id="example-button" class="secondary" type="button">Use our three contracts</button>
          <span class="small muted" id="count"></span>
        </div>
      </form>
    </section>
    <section><div id="result" aria-live="polite"></div></section>`;
}

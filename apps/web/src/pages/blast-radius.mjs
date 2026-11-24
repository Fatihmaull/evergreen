/**
 * /dashboard/blast-radius/ — Shared code (components.md § "Dashboard revamp",
 * Blast radius). The watched contracts and the code they run on as a
 * two-column map, the largest shared entry as the one figure, and a side
 * panel for the selected node. `blast-radius.ts` draws every state.
 */
export const meta = {
  title: 'Blast radius — Evergreen',
  description:
    'Which of your Soroban testnet contracts run on the same code, so they stop together when it is archived.',
  active: '/dashboard/blast-radius/',
  eyebrow: 'Blast radius · Stellar testnet',
  heading: 'Shared code',
  script: '/assets/blast-radius.js',
  bare: true,
  panel: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Blast radius · Stellar testnet</p>
        <h1>Shared code</h1>
      </div>
      <div class="actions"><button class="secondary" type="button" id="br-add-toggle" aria-expanded="false" aria-controls="br-add">Add other contracts</button></div>
    </div>
    <p class="note" id="br-status" role="status">Asking the Evergreen API…</p>
    <noscript><p class="note">This page needs JavaScript to read the chain.</p></noscript>
    <form class="stack" id="br-add" hidden>
      <label class="field-label" for="br-ids">Other contract IDs, one per line. They are drawn beside your watched contracts, not added to the watchlist.</label>
      <textarea id="br-ids" spellcheck="false" placeholder="C…&#10;C…"></textarea>
      <div class="row"><button type="submit" id="br-scan">Scan together</button><span class="note" id="br-count"></span></div>
    </form>
    <section class="next" id="br-next" aria-label="Largest shared entry" hidden></section>
    <section class="block" id="br-map" aria-labelledby="map-h" hidden>
      <div class="block-head">
        <h2 id="map-h">Who depends on what</h2>
        <nav class="filters" id="br-filters" aria-label="Show"></nav>
      </div>
      <div class="graph-head" aria-hidden="true"><span>Your contracts</span><span id="br-right-h">Code they run on</span></div>
      <div id="br-svg"></div>
      <p class="note">Select an entry or a contract to trace it. Only the contracts drawn here are counted: others may run on the same code.</p>
    </section>`;
}

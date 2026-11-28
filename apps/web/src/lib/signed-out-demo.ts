/**
 * A labelled example for a gated page. No ledger count, no stroop figure:
 * a dash is not a reading.
 */
export function signedOutDemoHtml(page: string): string {
  return `<section class="block signed-out-demo" aria-label="Example, not your account">
    <p class="example-flag">Example layout, not a live account. Nothing here was read from the chain.</p>
    <p class="label">Example · ${page}</p>
    <p><span class="next-figure ink">—</span> <span class="next-unit">not a reading</span></p>
    <p class="note">Sign in to see your own ${page}. <a href="/login/">Sign in</a>. <a href="/dashboard/scanner/">The scanner</a> needs no account.</p>
  </section>`;
}

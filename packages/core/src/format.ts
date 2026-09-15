/**
 * Evidence must render identically on every machine that reads it.
 *
 * `Number.prototype.toLocaleString()` with no argument uses the *runtime's*
 * locale, which comes from the reader's environment. The same scan produces:
 *
 * ```
 * en-US   remaining:  1,682,587 ledgers
 * de-DE   remaining:  1.682.587 ledgers
 * fr-FR   remaining:  1 682 586 ledgers
 * ```
 *
 * The French form is the dangerous one: that separator is U+202F, a narrow
 * no-break space, so it *looks* like a space and fails any byte comparison
 * invisibly.
 *
 * This matters most on the artefact we least want questioned. Guinea-pig B's
 * crossing is the sprint's strongest claim and the thing a sceptical reviewer is
 * most likely to re-run themselves. If our committed numbers do not reproduce on
 * their machine, the finding they report is "your evidence does not reproduce" —
 * and they will be right, for a reason that has nothing to do with the chain.
 *
 * `scripts/check-locale-pinning.mjs` fails the build on an unpinned call, so
 * this cannot quietly come back.
 */
export const EVIDENCE_LOCALE = 'en-US';

/** Group a ledger count or stroop amount for display, identically everywhere. */
export function formatCount(value: number | bigint): string {
  return value.toLocaleString(EVIDENCE_LOCALE);
}

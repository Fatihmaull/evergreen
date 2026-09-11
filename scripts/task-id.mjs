/**
 * The shape of a task ID. ONE definition, imported by everything that parses
 * `BACKLOG.md`.
 *
 * This is a module rather than a constant copied into each script because the
 * copy is how it breaks. `check-task-ids.mjs` records that this class was
 * `[0-9a-c]` until 2026-09-10, which made `W3-D21-01d` and `W3-D21-01e`
 * invisible in both directions — untracked work produced by a character class
 * that had encoded "how many sub-tasks we happened to have" as a rule.
 *
 * It then happened AGAIN on 2026-09-12: `sync-notion.mjs` was written with its
 * own `[A-Z0-9-]+`, which silently dropped all 22 IDs with a letter suffix
 * while reporting "✓ parsed 124 task rows". Same defect, two days later, in a
 * new file, because the rule lived in a comment instead of in an import.
 *
 * So: suffix letters are open-ended, and there is exactly one place to change.
 *
 * There is a second reason beyond not repeating yourself. `check-task-ids.mjs`
 * CANNOT detect its own class being too narrow: narrowing it stops registering
 * `W3-D21-01d` and stops flagging references to it in the same stroke, so the
 * check stays green — verified 2026-09-12 by narrowing this class and watching
 * it report a cheerful "✓ 142 tasks". `sync-notion.mjs` measures parse coverage
 * against every row that occupies an ID slot, so it fails loudly on the same
 * mutation. Sharing this constant is what puts that guard in front of BOTH.
 */
export const ID = String.raw`W\d-D\d+-\d+[a-z]*|F-\d+|B-D\d+-\d+`;

/** A checkbox row in `BACKLOG.md`, with its optional `(F)`/`(R)`/`(S)` owner. */
export const ROW = new RegExp(String.raw`^- \[(.)\] \*\*(${ID})\*\*\s*(?:\((.)\))?`, 'gm');

/**
 * Anything that OCCUPIES a checkbox row's ID slot, well-formed or not.
 *
 * Used to prove the strict pattern did not skip anything. A parser that
 * silently drops rows reports success on partial work, which is how the
 * 2026-09-12 recurrence went unnoticed until the totals were checked by hand.
 */
export const ANY_ROW = /^- \[(.)\] \*\*([^*\n]+)\*\*/gm;

/**
 * Does this look like someone meant a task ID? Bolded lead-in words ("**Why:**")
 * are prose and are not tasks; a token carrying a digit and a hyphen is not.
 */
export function looksLikeTaskId(token) {
  return /\d/.test(token) && token.includes('-');
}

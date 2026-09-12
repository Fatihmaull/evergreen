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

/**
 * A checkbox row in `BACKLOG.md`, with its optional `(F)`/`(R)`/`(S)` owner.
 *
 * The owner group captures the LEADING character and tolerates an annotation
 * after it, because ownership transfers are written `(F, was R)`. The previous
 * `\((.)\)` required exactly one character, so those rows matched with NO owner
 * at all — and they are precisely the rows where ownership CHANGED, which is
 * the one case the mirror most needs corrected. Found by Rakha reviewing #102
 * against the real `W2-D9-01` and `W2-D9-02` rows.
 *
 * A genuinely absent owner still parses as absent: `OWNER[...]` returns
 * undefined for anything that is not F/R/S, and `planSync` never clears an
 * owner it cannot read.
 */
export const ROW = new RegExp(String.raw`^- \[(.)\] \*\*(${ID})\*\*\s*(?:\((.)[^)]*\))?`, 'gm');

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

/**
 * IDs of STANDING obligations — tracked work that will never carry a checkbox.
 *
 * `§ Recurring obligations` exists because a standing obligation is not an
 * unfinished task: carrying `W1-D4-09` as the one open Week 1 item made W1 read
 * 50/51 when the real state was "finished, with a cron job running", which
 * trains everyone to read `[~]` as debt.
 *
 * Both parsers must know about it, and for different reasons. `check-task-ids`
 * would call every reference to `W1-D4-09` dangling; `sync-notion` would report
 * its Notion row as a phantom on EVERY run. The second is the worse failure —
 * a phantom report that cries wolf every time is one people stop reading, which
 * silently disarms the mechanism rather than breaking it loudly.
 */
export function recurringIds(backlog) {
  const afterHeading = backlog.split(/^## Recurring obligations$/m)[1] ?? '';
  // Up to the next top-level heading, or the rest of the file if it is last.
  const section = afterHeading.split(/^## /m)[0];
  const found = section.matchAll(new RegExp(String.raw`\*\*\`?(${ID})\`?\*\*`, 'g'));
  return [...new Set([...found].map((m) => m[1]))];
}

/**
 * IDs that were RETIRED — struck through in `docs/CONVENTIONS.md`.
 *
 * A third category, alongside checkbox rows and standing obligations, and it
 * exists because CONVENTIONS is explicit that a retired ID must stay VISIBLE in
 * the mirror as `Dropped`:
 *
 *   "If the repo shows a retired ID and the mirror shows nothing, the mirror
 *    has stopped mirroring — and it has removed the very warning the retire
 *    rule exists to display."
 *
 * So `W3-D18-02` in Notion with no `BACKLOG.md` row is not a phantom. It is the
 * retire rule working. Reporting it every run is the `W1-D4-09` false positive
 * again — a warning that needs no response is one people stop reading, which
 * disarms the mechanism quietly instead of breaking it loudly.
 *
 * Strikethrough is the documented marker for exactly this, so it is the source
 * rather than a second hand-kept list that would drift from it.
 */
export function retiredIds(conventions) {
  const found = conventions.matchAll(new RegExp(String.raw`~~\`?(${ID})\`?~~`, 'g'));
  return [...new Set([...found].map((m) => m[1]))];
}

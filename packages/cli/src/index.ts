/**
 * The `evergreen` CLI. Deliberately thin: parse args, call core, format output,
 * map errors to readable messages, set exit codes.
 *
 * Commands (built W1-D7 onward): `scan`, `extend`, `optimize`.
 *
 * Two contracts the rest of the system depends on, so keep both stable once
 * published:
 *   - Exit code is non-zero when a contract is below threshold. The
 *     `evergreen-check` GitHub Action reads nothing else.
 *   - `--json` output shape.
 *
 * Anything that can submit a transaction defaults to dry-run. Live submission
 * requires an explicit flag (CLAUDE.md hard rule 6).
 */

/** Package marker — replaced by the real command surface at W1-D7-01. */
export const CLI_PLACEHOLDER = true;

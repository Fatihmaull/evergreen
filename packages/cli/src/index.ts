/**
 * The `evergreen` CLI. Deliberately thin: parse args, call core, format output,
 * set exit codes. All logic lives in core.
 *
 * Two contracts the rest of the system depends on — keep both stable once
 * published, because the `evergreen-check` GitHub Action reads nothing else:
 *   - the exit code (0 healthy, non-zero below threshold, 2 on error)
 *   - the `--json` output shape
 */
export { EXIT_BELOW_THRESHOLD, EXIT_ERROR, EXIT_OK, exitCodeFor, formatHuman } from './scan.js';

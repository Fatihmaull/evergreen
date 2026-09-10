/**
 * The `evergreen` CLI. Deliberately thin: parse args, call core, format output,
 * set exit codes. All logic lives in core.
 *
 * Two contracts the rest of the system depends on — keep both stable once
 * published, because the `evergreen-check` GitHub Action reads nothing else:
 *   - the health exit code (0 healthy scope, 1 low TTL, 2 error, 3 incomplete)
 *   - the `--json` output shape
 * Neither authorizes a transaction; structured observations drive future engine decisions.
 */
export {
  EXIT_BELOW_THRESHOLD,
  EXIT_ERROR,
  EXIT_INCOMPLETE,
  EXIT_OK,
  exitCodeFor,
  formatHuman,
} from './scan.js';

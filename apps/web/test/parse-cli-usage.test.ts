/**
 * The regression that published half a usage string for two weeks.
 *
 * `/docs/cli/scan/` says it is generated from the tool's own help text. Its
 * generator read only the first single-quoted segment of `USAGE`, so the
 * `evergreen extend` line under the `evergreen scan` line was dropped — on
 * production, verified 2026-10-15. Nothing failed, because the page still had
 * a usage block and it still looked like one.
 *
 * The fixtures below are the shape `command.ts` had before the change, the
 * shape it has now, and the mutations that must not pass silently.
 */
import { describe, expect, test } from 'vitest';
// @ts-expect-error — a plain .mjs build helper with no declarations.
import { parseUsage } from '../scripts/parse-cli-usage.mjs';

/** What `packages/cli/src/command.ts` declares today: two segments, one `\n`. */
const TWO_SEGMENTS = [
  'const USAGE =',
  "  'usage: evergreen scan <contract-id> [--json]\\n' +",
  "  '       evergreen extend <contract-id> --ledgers N [...]';",
  '',
].join('\n');

/** The single-segment shape it had when the reader was written. */
const ONE_SEGMENT = ["const USAGE = 'usage: evergreen scan <contract-id> [--json]';", ''].join(
  '\n',
);

describe('parseUsage', () => {
  test('reads every segment of a concatenated declaration', () => {
    const { usage, segments } = parseUsage(TWO_SEGMENTS);
    expect(segments).toHaveLength(2);
    // The defect: this line was missing from the published page.
    expect(usage).toContain('evergreen extend <contract-id> --ledgers N');
    expect(usage).toContain('usage: evergreen scan');
  });

  test('resolves the escapes a string literal would have resolved', () => {
    const { usage } = parseUsage(TWO_SEGMENTS);
    // The symptom: a literal backslash-n rendered inside the terminal block.
    expect(usage).not.toMatch(/\\n/);
    expect(usage.split('\n')).toHaveLength(2);
  });

  test('still reads the single-segment shape, so the fix is not a rewrite', () => {
    const { usage, segments } = parseUsage(ONE_SEGMENT);
    expect(segments).toHaveLength(1);
    expect(usage).toBe('usage: evergreen scan <contract-id> [--json]');
  });

  test('reports nothing rather than a guess when the declaration is gone', () => {
    // `readCli` turns an empty segment list into a refusal to build; the
    // parser's job is to say it found nothing, not to invent a usage line.
    expect(parseUsage('const SOMETHING_ELSE = 1;\n')).toEqual({ usage: '', segments: [] });
  });

  test('a lone first segment is visibly incomplete, which is what the build asserts on', () => {
    // The old reader's behaviour, reproduced: one segment, no extend line.
    const { usage, segments } = parseUsage(
      ['const USAGE =', "  'usage: evergreen scan <contract-id>';", ''].join('\n'),
    );
    expect(segments).toHaveLength(1);
    expect(usage).not.toContain('evergreen extend');
  });

  test('resolves escaped quotes and backslashes in one pass', () => {
    // The source line is:   'it\'s \\ a path\n'
    const source = ['const USAGE =', "  'it\\'s \\\\ a path\\n';", ''].join('\n');
    expect(parseUsage(source).usage).toBe("it's \\ a path\n");
  });

  test('an escaped backslash before n is two characters, not a newline', () => {
    // The source line is:   'C:\\nope'
    // A chain of replaces resolves that to a newline, because the \n rule runs
    // first and sees the tail of the backslash pair. One pass does not.
    const source = ['const USAGE =', "  'C:\\\\nope';", ''].join('\n');
    const { usage } = parseUsage(source);
    expect(usage).toBe('C:\\nope');
    expect(usage).not.toContain('\n');
  });
});

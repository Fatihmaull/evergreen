/**
 * The `USAGE` constant in `packages/cli/src/command.ts`, read from its source.
 *
 * Its own module, rather than a few lines inside `build.mjs`, so that the
 * parsing can be tested on fixtures instead of only on whatever `command.ts`
 * happens to say today. It was wrong for two weeks and no test could see it.
 *
 * What went wrong: `USAGE` is declared as two single-quoted segments joined
 * with `+`, and the reader matched `/const USAGE =\n?\s*'([^']+)'/` — the FIRST
 * segment and nothing else. So `/docs/cli/scan/` published the `evergreen scan`
 * line and silently dropped the `evergreen extend` line beneath it, on a page
 * whose subtitle says it is generated from the tool's own help text. Verified
 * against production on 2026-10-15: the second line was not there.
 *
 * The omission only became visible when the first segment gained a trailing
 * `\n` escape, because the capture is source text, so the page rendered a
 * literal backslash-n. A defect that is silent until it is ugly is worse than
 * one that is ugly immediately.
 */

/**
 * Every single-quoted segment of the declaration, concatenated, with the
 * escapes a JavaScript string literal would have resolved.
 *
 * Returns `{ usage, segments }`. The caller decides what to refuse; this
 * function does not throw, so the assertions live where the error message can
 * say what the build was about to publish.
 */
export function parseUsage(source) {
  const declaration = source.match(/const USAGE =([\s\S]*?);\n/)?.[1];
  if (!declaration) return { usage: '', segments: [] };
  const segments = [...declaration.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(([, segment]) => segment);
  /**
   * One pass, not a chain of replaces.
   *
   * A chain resolves `\\n` — an escaped backslash followed by `n`, which a
   * string literal reads as two characters — into a newline, because the
   * `\\n` rule runs before the `\\\\` rule and sees the tail of the pair. One
   * pass consumes each backslash with the character it escapes, so the pair is
   * resolved to a single backslash and the `n` is left alone.
   */
  const RESOLVED = { n: '\n', t: '\t', r: '\r' };
  const usage = segments
    .join('')
    .replace(/\\(.)/g, (_, character) => RESOLVED[character] ?? character);
  return { usage, segments };
}

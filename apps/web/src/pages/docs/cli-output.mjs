/**
 * /docs/cli/output/ — the human report and the machine record.
 */
export const meta = {
  title: 'Output',
  description:
    'The human scan report is a summary; --json is the complete record. How colour, piping and screenshots are handled.',
  heading: 'Output',
  lead: 'The human report is a summary. The JSON is the complete record, including every issue the summary compresses.',
};

export function render() {
  return `
    <h2 id="human">The human report</h2>
    <p>
      One block per entry, then a worst-of summary. Each block names the entry kind, its ledger
      key, the contracts it serves, what remains, where it ends and how it was graded.
    </p>
    <p>
      Colour is added only for an interactive terminal and honours
      <span class="mono">NO_COLOR</span>. <strong>The state word always prints</strong>, so piped
      output and screenshots lose nothing — a red <span class="mono">CRITICAL</span> and a plain
      <span class="mono">CRITICAL</span> carry the same information.
    </p>

    <h2 id="json">--json</h2>
    <p>
      Prints the <span class="mono">ScanResult</span>: entries keyed by ledger key, each carrying
      the contracts it serves, plus <span class="mono">health</span>,
      <span class="mono">cost</span> and <span class="mono">optimization</span> blocks.
    </p>
    <p>
      The shape is declared in <span class="mono">packages/shared-types/src/index.ts</span>. That
      declaration is authoritative and is <strong>not copied</strong> into this documentation,
      because a copy drifts. Every JSON panel on this site prints the same shape the CLI prints.
    </p>
    <p class="note">
      The human view compresses issues into a count — <span class="mono">Scan is PARTIAL — 2
      issue(s)</span>. The JSON carries every one of them with its code and the contracts it
      applies to. If you are building on the output, build on the JSON.
    </p>

    <h2 id="issues">Issues are part of the result</h2>
    <p>
      An issue is not an error. <span class="mono">sharing-undetermined</span> and
      <span class="mono">coverage-limited</span> both appear on a scan that completed normally;
      they record what the scan could not establish. A consumer that ignores them is reading a
      partial answer as a complete one.
      <a class="site-more" href="/docs/reference/states/">Undetermined, unread, not found</a>
    </p>
  `;
}

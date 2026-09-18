/**
 * Rendering. Wording comes from core and the CLI wherever they have words for
 * something — the PARTIAL line, the coverage caveats, the sharing message — so
 * the interface and the tool cannot say different things about one scan.
 */
import type { AssessedEntry, ScanReport } from './evergreen';
import { estimateEndsAt } from './evergreen';
import { approxDate, approxDateShort, esc, formatCount, short } from './format';

const KIND_WORD: Record<string, string> = {
  instance: 'contract instance',
  code: 'contract code',
  persistent: 'persistent data',
  temporary: 'temporary data',
};

export function chip(entry: AssessedEntry): string {
  const { assessment, entry: e } = entry;
  if (assessment.isExpired) {
    const word = e.endBehavior === 'deleted' ? 'deleted' : 'archived';
    return `<span class="chip expired"><span class="shape"></span>${word}</span>`;
  }
  if (assessment.health === 'unknown') {
    return '<span class="chip undetermined"><span class="shape"></span>unread</span>';
  }
  return `<span class="chip ${assessment.health}"><span class="shape"></span>${assessment.health}</span>`;
}

export function sharingCell(entry: AssessedEntry): string {
  const { sharingStatus, blastRadiusAtLeast } = entry.assessment;
  if (sharingStatus === 'shared') {
    return `<span class="chip critical"><span class="shape"></span>shared · at least ${blastRadiusAtLeast}</span>`;
  }
  if (sharingStatus === 'undetermined') {
    return '<span class="chip undetermined"><span class="shape"></span>undetermined (≥1)</span>';
  }
  return '<span class="small muted">this contract only</span>';
}

/** The entry that expires first: the real expiry, and not the first number a naive tool shows. */
export function bindingEntry(report: ScanReport): AssessedEntry | undefined {
  const known = report.entries.filter((e) => e.entry.ttl.status === 'known');
  if (known.length === 0) return undefined;
  return known.reduce((a, b) =>
    (a.entry.ttl.status === 'known' ? a.entry.ttl.endsAtLedger : Infinity) <=
    (b.entry.ttl.status === 'known' ? b.entry.ttl.endsAtLedger : Infinity)
      ? a
      : b,
  );
}

export function verdict(report: ScanReport, now = new Date()): string {
  const binding = bindingEntry(report);
  const worst = report.worst;
  const tone = worst === undefined ? 'unknown' : worst === 'unknown' ? 'undetermined' : worst;

  let headline: string;
  if (report.verdict === 'error') {
    headline = 'The scan could not be completed. The contract is unaffected by our failure to read it.';
  } else if (!binding) {
    headline = 'Nothing was read. Absence is not proof of archival or deletion.';
  } else {
    const ttl = binding.entry.ttl;
    const ends = ttl.status === 'known' ? ttl.endsAtLedger : undefined;
    const kind = esc(KIND_WORD[binding.entry.kind] ?? binding.entry.kind);
    const when = esc(approxDate(estimateEndsAt(ttl, now)));
    const at = `<span class="mono">${esc(formatCount(ends ?? 0))}</span>`;
    headline =
      report.result.contracts.length > 1
        ? `The earliest entry in this scan is a ${kind} entry, expiring <strong>${when}</strong> at ledger ${at}. ` +
          `It binds the contract it belongs to, not all of them — each contract's own binding entry is in the table.`
        : `This contract stops working on <strong>${when}</strong>, at ledger ${at} — its ${kind} entry expires first.`;
  }

  const partial = report.partial
    ? `<p class="coverage">Scan is PARTIAL — ${report.issues.length} issue(s). Absence is not health.</p>`
    : '';

  // One message per distinct caveat: the same sentence repeated per contract is
  // noise, and noise is what stops a caveat being read.
  const caveats = [
    ...new Set(
      report.issues
        .filter((i) => i.kind === 'coverage-limited' || i.kind === 'sharing-undetermined')
        .map((i) => i.message),
    ),
  ]
    .map((message) => `<p class="small muted">${esc(message)}</p>`)
    .join('');

  const failures = report.issues
    .filter((i) => i.kind !== 'coverage-limited' && i.kind !== 'sharing-undetermined')
    .map((i) => `<p class="small muted"><span class="mono">${esc(i.kind)}</span> — ${esc(i.message)}</p>`)
    .join('');

  const chipHtml =
    worst === undefined
      ? ''
      : worst === 'unknown'
        ? '<span class="chip undetermined"><span class="shape"></span>unread</span>'
        : `<span class="chip ${worst}"><span class="shape"></span>${worst}</span>`;

  return `
    <div class="verdict ${tone}">
      <div class="row">${chipHtml}
        <span class="meta">worst entry health · warn below ${formatCount(report.thresholds.warnBelowLedgers)} · act at or below ${formatCount(report.thresholds.criticalBelowLedgers)} ledgers</span>
      </div>
      <p class="headline">${headline}</p>
      ${partial}
      ${caveats}${failures}
    </div>`;
}

export function entryTable(report: ScanReport, now = new Date()): string {
  // Only a single-contract scan has one entry that binds everything it covers.
  const binding = report.result.contracts.length === 1 ? bindingEntry(report) : undefined;
  const rows = report.entries
    .map((e) => {
      const ttl = e.entry.ttl;
      const known = ttl.status === 'known';
      const isBinding = binding && binding.key === e.key;
      return `<tr>
        <td>${esc(KIND_WORD[e.entry.kind] ?? e.entry.kind)}${isBinding ? '<span class="binding-tag">binds</span>' : ''}</td>
        <td class="num">${esc(short(e.key, 16, 12))}
          <button class="copy" type="button" data-copy="${esc(e.key)}">copy</button></td>
        <td class="num">${known ? esc(formatCount(ttl.remainingLedgers)) : '—'}</td>
        <td class="num">${known ? esc(approxDateShort(estimateEndsAt(ttl, now))) : '—'}</td>
        <td class="num">${known ? esc(formatCount(ttl.endsAtLedger)) : '—'}</td>
        <td>${chip(e)}</td>
        <td>${sharingCell(e)}</td>
      </tr>`;
    })
    .join('');

  return `<div class="table-wrap"><table>
      <thead><tr>
        <th scope="col">Entry</th><th scope="col">Ledger key</th><th scope="col">Remaining</th>
        <th scope="col">Expires ~</th><th scope="col">Expiry ledger</th><th scope="col">Health</th>
        <th scope="col">Blast radius</th>
      </tr></thead>
      <tbody>${rows || '<tr><td colspan="7" class="muted">No entries were returned.</td></tr>'}</tbody>
    </table></div>`;
}

/** Always shown for a single contract, because a single scan can never settle sharing. */
export function blastRadiusPanel(report: ScanReport, ids: readonly string[]): string {
  const undetermined = report.entries.filter((e) => e.assessment.sharingStatus === 'undetermined');
  const shared = report.entries.filter((e) => e.assessment.sharingStatus === 'shared');
  const href = `/dashboard/blast-radius/?ids=${encodeURIComponent(ids.join('\n'))}`;

  if (shared.length > 0) {
    const e = shared[0]!;
    return `<div class="panel note">
      <h3>Blast radius</h3>
      <p>${esc(e.assessment.reason)}</p>
      <p class="small muted">Even this proves only a lower bound: contracts you did not list may also depend on that entry.</p>
    </div>`;
  }
  if (undetermined.length === 0) return '';
  const message = report.issues.find((i) => i.kind === 'sharing-undetermined')?.message ?? '';
  return `<div class="panel undetermined">
    <h3><span class="chip undetermined"><span class="shape"></span>undetermined</span> Blast radius</h3>
    <p>${esc(message)}</p>
    <p><a class="pill" href="${esc(href)}">Open Blast Radius with this ID →</a></p>
  </div>`;
}

export function jsonPanel(result: unknown, health: unknown): string {
  const body = JSON.stringify({ ...(result as object), health }, null, 2);
  return `<details class="card card-pad">
    <summary>JSON — the same shape the CLI prints with <span class="mono">--json</span></summary>
    <div class="terminal">${esc(body)}</div>
  </details>`;
}

export function contractCard(
  label: string,
  id: string,
  report: ScanReport,
  now = new Date(),
): string {
  const binding = bindingEntry(report);
  const ttl = binding?.entry.ttl;
  const known = ttl?.status === 'known';
  const worst = report.worst;
  const chipHtml =
    worst === undefined
      ? '<span class="chip undetermined"><span class="shape"></span>unread</span>'
      : worst === 'unknown'
        ? '<span class="chip undetermined"><span class="shape"></span>unread</span>'
        : `<span class="chip ${worst}"><span class="shape"></span>${worst}</span>`;
  return `<article class="card contract-card">
    <div class="row"><span class="name">${esc(label)}</span>${chipHtml}</div>
    <div class="id">${esc(id)}</div>
    <dl>
      <dt>binds</dt><dd>${esc(binding ? (KIND_WORD[binding.entry.kind] ?? binding.entry.kind) : '—')}</dd>
      <dt>remaining</dt><dd>${known ? esc(formatCount(ttl.remainingLedgers)) : '—'}</dd>
      <dt>expires</dt><dd>${known ? esc(approxDateShort(estimateEndsAt(ttl, now))) : '—'}</dd>
      <dt>at ledger</dt><dd>${known ? esc(formatCount(ttl.endsAtLedger)) : '—'}</dd>
    </dl>
  </article>`;
}

/** Contracts on one side, ledger entries on the other; the shared entry dominates. */
export function graph(report: ScanReport, now = new Date()): string {
  const contracts = report.result.contracts.map((c) => c.id);
  const entries = [...report.entries].sort(
    (a, b) => b.assessment.observedContractCount - a.assessment.observedContractCount,
  );
  if (contracts.length === 0 || entries.length === 0) return '';

  const rowC = 74;
  const rowE = 86;
  const width = 940;
  const leftW = 268;
  const rightW = 330;
  const rightX = width - rightW - 16;
  const height = Math.max(contracts.length * rowC, entries.length * rowE) + 32;
  const cy = (i: number, n: number, row: number) => (height - n * row) / 2 + i * row + row / 2;

  const edges = entries
    .flatMap((e, j) =>
      e.entry.contracts.map((id) => {
        const i = contracts.indexOf(id);
        if (i < 0) return '';
        const y1 = cy(i, contracts.length, rowC);
        const y2 = cy(j, entries.length, rowE);
        const x1 = 16 + leftW;
        const mid = (x1 + rightX) / 2;
        return `<path class="edge" d="M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${rightX} ${y2}"/>`;
      }),
    )
    .join('');

  const contractNodes = contracts
    .map((id, i) => {
      const y = cy(i, contracts.length, rowC) - 24;
      return `<g><rect class="node" x="16" y="${y}" width="${leftW}" height="48" rx="6"/>
        <text x="32" y="${y + 20}">${esc(short(id, 10, 8))}</text>
        <text class="dim" x="32" y="${y + 36}">contract</text></g>`;
    })
    .join('');

  const entryNodes = entries
    .map((e, j) => {
      const shared = e.assessment.observedContractCount > 1;
      const h = shared ? 72 : 56;
      const y = cy(j, entries.length, rowE) - h / 2;
      const ttl = e.entry.ttl;
      const cls = shared ? ' on-pine' : '';
      const line3 = shared
        ? `<text class="dim${cls}" x="${rightX + 16}" y="${y + 58}">shared by ${e.assessment.observedContractCount} · they fail together</text>`
        : '';
      return `<g><rect class="node${shared ? ' shared' : ''}" x="${rightX}" y="${y}" width="${rightW}" height="${h}" rx="6"/>
        <text class="${cls.trim()}" x="${rightX + 16}" y="${y + 22}">${esc(KIND_WORD[e.entry.kind] ?? e.entry.kind)}${
          shared ? '' : ` · of ${esc(short(e.entry.contracts[0] ?? '', 4, 4))}`
        } · ${esc(short(e.key, 10, 8))}</text>
        <text class="dim${cls}" x="${rightX + 16}" y="${y + 40}">${
          ttl.status === 'known'
            ? `${esc(formatCount(ttl.remainingLedgers))} ledgers left · ${esc(approxDateShort(estimateEndsAt(ttl, now)))}`
            : 'no TTL metadata returned'
        }</text>${line3}</g>`;
    })
    .join('');

  return `<div class="graph-wrap"><svg class="graph" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img"
      aria-label="Contracts on the left, the ledger entries they depend on on the right. The shared entry is filled.">
      ${edges}${contractNodes}${entryNodes}
    </svg></div>`;
}

export function wireCopyButtons(root: ParentNode = document): void {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button.copy')) {
    button.addEventListener('click', () => {
      // Copies the full value, never the truncation.
      void navigator.clipboard?.writeText(button.dataset.copy ?? '');
      const original = button.textContent;
      button.textContent = 'copied';
      setTimeout(() => (button.textContent = original), 1200);
    });
  }
}

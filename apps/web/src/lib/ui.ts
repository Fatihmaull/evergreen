/**
 * Rendering. Wording comes from core and the CLI wherever they have words for
 * something — the PARTIAL line, the coverage caveats, the sharing message — so
 * the interface and the tool cannot say different things about one scan.
 */
import type { AssessedEntry, ScanReport } from './evergreen';
import { bindingEntry as pickBinding, entryView, type EntryView } from './view';
import { approxDate, approxDateShort, esc, formatCount, short } from './format';

const KIND_WORD: Record<string, string> = {
  instance: 'contract instance',
  code: 'contract code',
  persistent: 'persistent data',
  temporary: 'temporary data',
};

export function chip(entry: AssessedEntry): string {
  const { assessment } = entry;
  const view = entryView(entry);
  if (view.state === 'expired') {
    return `<span class="chip expired"><span class="shape"></span>${view.word}</span>`;
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

/** The entry that decides the contract's fate — expired binds first. See `view.ts`. */
export function bindingEntry(report: ScanReport, now = new Date()): AssessedEntry | undefined {
  return pickBinding(report.entries, now);
}

/**
 * Where an expired entry ended, when a committed measurement recorded it.
 *
 * The chain cannot answer this: an archived entry reports `liveUntilLedgerSeq`
 * 0, so the ledger it ended at is gone from the scan. For anything but our own
 * subjects there is no honest number, and this says so instead of guessing.
 */
function endedAt(view: Extract<EntryView, { state: 'expired' }>): string {
  if (view.endedAtLedger === undefined) {
    return (
      ` The chain reports an archived entry as <span class="mono">liveUntilLedgerSeq 0</span>, so the ledger it ` +
      `ended at can no longer be read from a scan — only that it is past. Read at ledger ` +
      `<span class="mono">${esc(formatCount(view.observedAtLedger))}</span>.`
    );
  }
  return (
    ` It ended at ledger <span class="mono">${esc(formatCount(view.endedAtLedger))}</span>` +
    `${view.endedOn ? `, ${esc(approxDateShort(new Date(view.endedOn)))}` : ''}.`
  );
}

export function verdict(report: ScanReport, now = new Date()): string {
  const binding = bindingEntry(report);
  const worst = report.worst;
  const tone = worst === undefined ? 'unknown' : worst === 'unknown' ? 'undetermined' : worst;

  let headline: string;
  if (report.verdict === 'error') {
    headline =
      'The scan could not be completed. The contract is unaffected by our failure to read it.';
  } else if (!binding) {
    headline = 'Nothing was read. Absence is not proof of archival or deletion.';
  } else {
    const view = entryView(binding, now);
    const kind = esc(KIND_WORD[binding.entry.kind] ?? binding.entry.kind);
    const many = report.result.contracts.length > 1;

    if (view.state === 'expired') {
      // Not an error the page is coping with. It is the finished answer.
      headline = many
        ? `The earliest entry in this scan is a ${kind} entry, and it is already ${view.word}.` +
          `${endedAt(view)} ${esc(view.reason)} It binds the contract it belongs to, not all of them.`
        : `<strong>This contract has stopped working.</strong> Its ${kind} entry is ${view.word}.` +
          `${endedAt(view)} ${esc(view.reason)}`;
    } else if (view.state === 'unread') {
      headline = `The ${kind} entry that binds this contract returned no TTL. Unread is not healthy.`;
    } else {
      const when = esc(approxDate(view.endsAt));
      const at = `<span class="mono">${esc(formatCount(view.endsAtLedger))}</span>`;
      headline = many
        ? `The earliest entry in this scan is a ${kind} entry, expiring <strong>${when}</strong> at ledger ${at}. ` +
          `It binds the contract it belongs to, not all of them — each contract's own binding entry is in the table.`
        : `This contract stops working on <strong>${when}</strong>, at ledger ${at} — its ${kind} entry expires first.`;
    }
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
    .map(
      (i) =>
        `<p class="small muted"><span class="mono">${esc(i.kind)}</span> — ${esc(i.message)}</p>`,
    )
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
      const view = entryView(e, now);
      const isBinding = binding && binding.key === e.key;
      // An expired row carries no remaining count, no projected date and no
      // expiry ledger, because the chain no longer holds any of the three. The
      // row states what it is instead of filling the columns with a zero's
      // arithmetic.
      const cells =
        view.state === 'expired'
          ? `<td class="num" colspan="3"><span class="expired-cell">${view.word}</span>
               ${view.endedAtLedger === undefined ? '<span class="small">ledger no longer readable</span>' : `<span class="small mono">ended at ${esc(formatCount(view.endedAtLedger))}</span>`}</td>`
          : view.state === 'unread'
            ? `<td class="num">—</td><td class="num">—</td><td class="num">—</td>`
            : `<td class="num">${esc(formatCount(view.remainingLedgers))}</td>
               <td class="num">${esc(approxDateShort(view.endsAt))}</td>
               <td class="num">${esc(formatCount(view.endsAtLedger))}</td>`;
      return `<tr${view.state === 'expired' ? ' class="row-expired"' : ''}>
        <td>${esc(KIND_WORD[e.entry.kind] ?? e.entry.kind)}${isBinding ? '<span class="binding-tag">binds</span>' : ''}</td>
        <td class="num">${esc(short(e.key, 16, 12))}
          <button class="copy" type="button" data-copy="${esc(e.key)}">copy</button></td>
        ${cells}
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
  // `?? ''` here rendered an empty paragraph: the caveat silently disappeared
  // and the panel showed a heading with nothing under it. A coverage caveat
  // that vanishes is worse than a missing panel, because the heading still
  // implies one was given.
  const message =
    report.issues.find((i) => i.kind === 'sharing-undetermined')?.message ??
    'A single-contract scan cannot determine whether other contracts depend on this entry. ' +
      'The chain does not index reverse dependencies from one query.';
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
  const binding = bindingEntry(report, now);
  const view = binding ? entryView(binding, now) : undefined;
  const worst = report.worst;
  const chipHtml =
    worst === undefined || worst === 'unknown'
      ? '<span class="chip undetermined"><span class="shape"></span>unread</span>'
      : `<span class="chip ${worst}"><span class="shape"></span>${worst}</span>`;
  const kind = esc(binding ? (KIND_WORD[binding.entry.kind] ?? binding.entry.kind) : '—');

  // The expired card is the most confident cell on the page, not a degraded
  // one: this contract was left alone, and here is what became of it.
  if (view?.state === 'expired') {
    return `<article class="card contract-card expired-card">
      <div class="row"><span class="name">${esc(label)}</span>
        <span class="chip expired"><span class="shape"></span>${view.word}</span></div>
      <div class="id">${esc(id)}</div>
      <p class="expired-headline">${view.word}</p>
      <dl>
        <dt>entry</dt><dd>${kind}</dd>
        ${
          view.endedAtLedger === undefined
            ? `<dt>ended at</dt><dd>no longer readable</dd>`
            : `<dt>ended at</dt><dd>ledger ${esc(formatCount(view.endedAtLedger))}${view.endedOn ? ` · ${esc(approxDateShort(new Date(view.endedOn)))}` : ''}</dd>`
        }
        <dt>read at</dt><dd>ledger ${esc(formatCount(view.observedAtLedger))}</dd>
      </dl>
      <p class="small">${esc(view.reason)}</p>
    </article>`;
  }

  return `<article class="card contract-card">
    <div class="row"><span class="name">${esc(label)}</span>${chipHtml}</div>
    <div class="id">${esc(id)}</div>
    <dl>
      <dt>binds</dt><dd>${kind}</dd>
      <dt>remaining</dt><dd>${view?.state === 'live' ? esc(formatCount(view.remainingLedgers)) : '—'}</dd>
      <dt>expires</dt><dd>${view?.state === 'live' ? esc(approxDateShort(view.endsAt)) : '—'}</dd>
      <dt>at ledger</dt><dd>${view?.state === 'live' ? esc(formatCount(view.endsAtLedger)) : '—'}</dd>
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
      const view = entryView(e, now);
      const cls = shared ? ' on-pine' : '';
      const line3 = shared
        ? `<text class="dim${cls}" x="${rightX + 16}" y="${y + 58}">shared by ${e.assessment.observedContractCount} · they fail together</text>`
        : '';
      return `<g><rect class="node${shared ? ' shared' : ''}" x="${rightX}" y="${y}" width="${rightW}" height="${h}" rx="6"/>
        <text class="${cls.trim()}" x="${rightX + 16}" y="${y + 22}">${esc(KIND_WORD[e.entry.kind] ?? e.entry.kind)}${
          shared || e.entry.contracts[0] === undefined
            ? ''
            : ` · of ${esc(short(e.entry.contracts[0], 4, 4))}`
        } · ${esc(short(e.key, 10, 8))}</text>
        <text class="dim${cls}" x="${rightX + 16}" y="${y + 40}">${
          view.state === 'live'
            ? `${esc(formatCount(view.remainingLedgers))} ledgers left · ${esc(approxDateShort(view.endsAt))}`
            : view.state === 'expired'
              ? `${view.word}${view.endedAtLedger === undefined ? '' : ` · ended at ledger ${esc(formatCount(view.endedAtLedger))}`}`
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
      // Copies the full value, never the truncation — and never an empty
      // string, which would report "copied" while putting nothing on the
      // clipboard.
      const value = button.dataset.copy;
      const original = button.textContent;
      if (value === undefined || value === '') {
        button.textContent = 'nothing to copy';
        setTimeout(() => (button.textContent = original), 1200);
        return;
      }
      void navigator.clipboard?.writeText(value);
      button.textContent = 'copied';
      setTimeout(() => (button.textContent = original), 1200);
    });
  }
}

/**
 * Overview. A stat strip over our three contracts, then their cards.
 *
 * Live reads can fail in front of an audience, so everything here falls back
 * to the snapshot committed with the build and says which ledger it was
 * recorded at. Stale readings are labelled, never presented as current.
 */
import {
  OUR_CONTRACTS,
  report,
  scanMany,
  worstHealth,
  type ScanReport,
  type ScanResult,
} from '../lib/evergreen';
import { approxDateShort, esc, formatCount, stamp } from '../lib/format';
import { bindingEntry, contractCard } from '../lib/ui';
import { entryView } from '../lib/view';
import { mountScanPanel } from '../lib/scan-panel';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function subReport(full: ScanReport, contractId: string): ScanReport {
  const entries = full.entries.filter((e) => e.entry.contracts.includes(contractId));
  return {
    ...full,
    entries,
    worst: worstHealth(entries.map((e) => e.assessment)),
    result: { ...full.result, contracts: [{ id: contractId }] },
  };
}

function statStrip(full: ScanReport): string {
  const cells = OUR_CONTRACTS.map((c) => {
    const sub = subReport(full, c.id);
    const binding = bindingEntry(sub);
    const view = binding ? entryView(binding) : undefined;
    const worst = sub.worst ?? 'unknown';
    const tone = worst === 'unknown' ? 'undetermined' : worst;

    // An expired subject gets the word, not a count. `-4,810,562 ledgers left`
    // is the arithmetic of a zero, and there is no remaining to report.
    if (view?.state === 'expired') {
      return `<div class="stat stat-expired">
        <p class="stat-label">${esc(c.label)}</p>
        <p class="stat-figure">${view.word}</p>
        <p class="stat-caption">${
          view.endedAtLedger === undefined
            ? `read at ledger ${esc(formatCount(view.observedAtLedger))}`
            : `ended at ledger ${esc(formatCount(view.endedAtLedger))}${view.endedOn ? ` · ${esc(approxDateShort(new Date(view.endedOn)))}` : ''}`
        }</p>
      </div>`;
    }

    return `<div class="stat">
      <p class="stat-label">${esc(c.label)}</p>
      <p class="stat-figure ${tone}">${
        view?.state === 'live' ? esc(formatCount(view.remainingLedgers)) : 'unread'
      }</p>
      <p class="stat-caption">${
        view?.state === 'live'
          ? `ledgers left · binds on ${esc(binding?.entry.kind ?? '')} · expires ${esc(approxDateShort(view.endsAt))}`
          : 'the read did not return a TTL — absence is not health'
      }</p>
    </div>`;
  }).join('');
  // Cells only. `#strip` already carries `.stat-strip`, and wrapping them in a
  // second one nested a three-column grid inside one column of itself, so every
  // cell rendered at 91px of a 302px column and the figures clipped.
  return cells;
}

async function load(): Promise<void> {
  const strip = $('strip');
  const target = $('ours');
  const note = $('ours-note');
  const ids = OUR_CONTRACTS.map((c) => c.id);
  try {
    const result = await scanMany(ids);
    if (Object.keys(result.entries).length === 0) throw new Error('no entries returned');
    const at = report(result).observedAtLedger;
    // `?? 0` here would print "ledger 0" — the same fabricated figure, from the
    // same habit of filling a hole with a number.
    render(
      result,
      at === undefined
        ? 'Read live from testnet; the response carried no observed ledger.'
        : `Read live from testnet at ledger ${formatCount(at)}.`,
    );
  } catch {
    try {
      const response = await fetch('/assets/snapshot.json', { cache: 'no-store' });
      const snapshot = (await response.json()) as { capturedAt: string; result: ScanResult };
      const at = report(snapshot.result).observedAtLedger;
      render(
        snapshot.result,
        `The live read failed, so this is the snapshot committed with this build: ${
          at === undefined ? 'no observed ledger recorded' : `as of ledger ${formatCount(at)}`
        }, recorded ${stamp(snapshot.capturedAt)}. It is not current.`,
      );
    } catch {
      note.textContent =
        'The live read failed and no snapshot is available. Nothing is shown rather than something stale.';
      strip.innerHTML = '';
      target.innerHTML = '';
    }
  }

  function render(result: ScanResult, noteText: string): void {
    const full = report(result);
    note.textContent = noteText;
    strip.innerHTML = statStrip(full);
    target.innerHTML = OUR_CONTRACTS.map((c) =>
      contractCard(c.label, c.id, subReport(full, c.id)),
    ).join('');
  }
}

// `/dashboard` must answer a stranger's question on its own — see the spec's
// amendment of 2026-09-23. The scan panel is the same one `/dashboard/scanner`
// mounts, not a second implementation.
mountScanPanel();

void load();

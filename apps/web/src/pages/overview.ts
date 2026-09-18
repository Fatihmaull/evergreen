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
import { estimateEndsAt } from '../lib/evergreen';

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
    const ttl = binding?.entry.ttl;
    const known = ttl?.status === 'known';
    const worst = sub.worst ?? 'unknown';
    const tone = worst === 'unknown' ? 'undetermined' : worst;
    return `<div class="stat">
      <p class="stat-label">${esc(c.label)}</p>
      <p class="stat-figure ${tone}">${
        known ? esc(formatCount(ttl.remainingLedgers)) : 'unread'
      }</p>
      <p class="stat-caption">${
        known
          ? `ledgers left · binds on ${esc(binding?.entry.kind ?? '')} · expires ${esc(approxDateShort(estimateEndsAt(ttl, new Date())))}`
          : 'the read did not return a TTL — absence is not health'
      }</p>
    </div>`;
  }).join('');
  return `<div class="stat-strip">${cells}</div>`;
}

async function load(): Promise<void> {
  const strip = $('strip');
  const target = $('ours');
  const note = $('ours-note');
  const ids = OUR_CONTRACTS.map((c) => c.id);
  try {
    const result = await scanMany(ids);
    if (Object.keys(result.entries).length === 0) throw new Error('no entries returned');
    render(result, `Read live from testnet at ledger ${formatCount(report(result).observedAtLedger ?? 0)}.`);
  } catch {
    try {
      const response = await fetch('/assets/snapshot.json', { cache: 'no-store' });
      const snapshot = (await response.json()) as { capturedAt: string; result: ScanResult };
      const at = report(snapshot.result).observedAtLedger ?? 0;
      render(
        snapshot.result,
        `The live read failed, so this is the snapshot committed with this build: as of ledger ${formatCount(at)}, recorded ${stamp(snapshot.capturedAt)}. It is not current.`,
      );
    } catch {
      note.textContent = 'The live read failed and no snapshot is available. Nothing is shown rather than something stale.';
      strip.innerHTML = '';
      target.innerHTML = '';
    }
  }

  function render(result: ScanResult, noteText: string): void {
    const full = report(result);
    note.textContent = noteText;
    strip.innerHTML = statStrip(full);
    target.innerHTML = OUR_CONTRACTS.map((c) => contractCard(c.label, c.id, subReport(full, c.id))).join('');
  }
}

void load();

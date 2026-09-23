/**
 * Blast radius. One contract ID per line, because a maintainer has these in a
 * list somewhere. The result is a dependency graph, and the notice that even
 * this proves only a lower bound.
 */
import {
  OUR_CONTRACTS,
  health,
  isValidContractId,
  report,
  scanMany,
  type ScanReport,
} from '../lib/evergreen';
import { approxDate, esc, formatCount } from '../lib/format';
import { entryTable, graph, jsonPanel, verdict, wireCopyButtons } from '../lib/ui';
import { entryView } from '../lib/view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function ids(): string[] {
  return $<HTMLTextAreaElement>('ids')
    .value.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateCount(): void {
  const list = ids();
  const invalid = list.filter((id) => !isValidContractId(id));
  $('count').textContent =
    `${list.length} contract${list.length === 1 ? '' : 's'} provided` +
    (invalid.length > 0 ? ` · ${invalid.length} not a valid contract ID` : '');
}

/** The sentence the page exists for, built from what the scan actually found. */
function sharedSentence(rep: ScanReport, now = new Date()): string {
  const shared = rep.entries.filter((e) => e.assessment.observedContractCount > 1);
  if (shared.length === 0) {
    return `<p class="headline">No entry in this scan is shared by more than one of the contracts you listed. That is not proof that none is shared — it is what these contracts, read together, can show.</p>`;
  }
  const lines = shared.map((e) => {
    const view = entryView(e, now);
    const count = e.assessment.observedContractCount;
    // A shared entry that has already expired took every contract with it —
    // past tense, and no projected date, because there is nothing to project.
    if (view.state === 'expired') {
      return (
        `These ${count} contracts shared 1 ${esc(e.entry.kind)} entry, and it is ${view.word}` +
        `${view.endedAtLedger === undefined ? '' : ` (ended at ledger <span class="mono">${esc(formatCount(view.endedAtLedger))}</span>)`}. ` +
        `They failed together. ${esc(view.reason)}`
      );
    }
    const when = view.state === 'live' ? approxDate(view.endsAt) : 'an unread date';
    const at =
      view.state === 'live'
        ? ` (ledger <span class="mono">${esc(formatCount(view.endsAtLedger))}</span>)`
        : '';
    return `These ${count} contracts share 1 ${esc(e.entry.kind)} entry. It expires <strong>${esc(when)}</strong>${at}. They fail together.`;
  });
  return lines.map((l) => `<p class="headline">${l}</p>`).join('');
}

async function run(event?: Event): Promise<void> {
  event?.preventDefault();
  const list = ids();
  const out = $('result');
  const button = $<HTMLButtonElement>('scan-button');
  const invalid = list.filter((id) => !isValidContractId(id));

  if (list.length === 0) {
    out.innerHTML = '<p class="muted">Add at least one contract ID.</p>';
    return;
  }
  if (invalid.length > 0) {
    out.innerHTML = `<div class="error-box"><p><strong>${invalid.length} of these is not a contract ID.</strong> Expected 56-character addresses beginning with <span class="mono">C</span>. Nothing was requested.</p>
      <p class="small mono">${invalid.map((i) => esc(i)).join('<br>')}</p></div>`;
    return;
  }

  button.disabled = true;
  button.textContent = 'Scanning…';
  out.innerHTML = '<p class="muted">Reading the chain…</p>';
  try {
    const result = await scanMany(list);
    const rep = report(result);
    out.innerHTML = [
      verdict(rep),
      `<div class="card card-pad stack">${sharedSentence(rep)}
        <p class="small muted">Even a scan of several contracts proves only a lower bound: contracts you did not list may also depend on that entry. That is why the count reads “at least”.</p>
      </div>`,
      graph(rep),
      entryTable(rep),
      jsonPanel(result, health(result)),
    ].join('');
    wireCopyButtons(out);
  } catch (error) {
    out.innerHTML = `<div class="error-box"><p><strong>The scan could not be completed.</strong> ${esc((error as Error).message)}</p>
      <p class="small muted">The endpoint is <span class="mono">https://soroban-testnet.stellar.org</span>. The contracts are unaffected by our failure to read them.</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Scan together';
  }
}

function start(): void {
  const field = $<HTMLTextAreaElement>('ids');
  const fromQuery = new URLSearchParams(location.search).get('ids');
  field.value = fromQuery ?? OUR_CONTRACTS.map((c) => c.id).join('\n');
  field.addEventListener('input', updateCount);
  updateCount();
  $('form').addEventListener('submit', (e) => void run(e));
  $('example-button').addEventListener('click', () => {
    field.value = OUR_CONTRACTS.map((c) => c.id).join('\n');
    updateCount();
  });
  // A single ID arriving from the dashboard is the interesting case: it shows
  // undetermined turning into a number.
  if (fromQuery) void run();
}

start();

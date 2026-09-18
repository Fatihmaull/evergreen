/**
 * Scanner console. One contract ID, optional data keys, then the verdict, the
 * entry table, the blast-radius panel, a rent estimate and the JSON — the same
 * order the reference lays out, with the tool's own wording throughout.
 *
 * Read-only: `scanContract` and simulated pricing. Nothing here signs,
 * submits, renews or broadcasts, and there is no control that implies it.
 */
import {
  OUR_CONTRACTS,
  health,
  isValidContractId,
  quoteRent,
  report,
  scanOne,
  type ScanReport,
  type ScanResult,
} from '../lib/evergreen';
import { approxXlm, esc, formatCount } from '../lib/format';
import { blastRadiusPanel, entryTable, jsonPanel, verdict, wireCopyButtons } from '../lib/ui';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let lastScan: { result: ScanResult; report: ScanReport } | undefined;

async function runScan(event: Event): Promise<void> {
  event.preventDefault();
  const id = $<HTMLInputElement>('contract-id').value.trim();
  const keysRaw = $<HTMLTextAreaElement>('data-keys').value.trim();
  const out = $('result');
  const button = $<HTMLButtonElement>('scan-button');

  if (!isValidContractId(id)) {
    out.innerHTML = `<div class="error-box"><p><strong>That is not a contract ID.</strong> Expected a 56-character Stellar contract address beginning with <span class="mono">C</span>. Nothing was requested.</p></div>`;
    return;
  }

  button.disabled = true;
  button.textContent = 'Scanning…';
  out.innerHTML = '<p class="muted">Reading the chain…</p>';
  try {
    const dataKeys = keysRaw ? keysRaw.split('\n').map((k) => k.trim()).filter(Boolean) : [];
    const result = await scanOne(id, dataKeys);
    const rep = report(result);
    lastScan = { result, report: rep };
    out.innerHTML = [
      verdict(rep),
      entryTable(rep),
      blastRadiusPanel(rep, [id]),
      `<div class="card card-pad stack" id="cost-panel">
         <div class="row">
           <button class="secondary" type="button" id="cost-button">Estimate rent to extend</button>
           <label class="small muted">by <input type="number" id="cost-ledgers" value="518400" min="1" step="1" style="width:9.5rem;display:inline-block"> more ledgers (about 30 days)</label>
         </div>
         <p class="small muted">Pricing asks the network to simulate the extension, one entry at a time, so it takes a moment. Nothing is submitted.</p>
       </div>`,
      jsonPanel(result, health(result)),
    ].join('');
    wireCopyButtons(out);
    $('cost-button').addEventListener('click', () => void runCost());
  } catch (error) {
    out.innerHTML = `<div class="error-box"><p><strong>The scan could not be completed.</strong> ${esc(
      (error as Error).message,
    )}</p><p class="small muted">The endpoint is <span class="mono">https://soroban-testnet.stellar.org</span>. The contract is unaffected by our failure to read it.</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = 'Scan';
  }
}

async function runCost(): Promise<void> {
  if (!lastScan) return;
  const panel = $('cost-panel');
  const ledgers = Number($<HTMLInputElement>('cost-ledgers').value) || 518_400;
  const button = $<HTMLButtonElement>('cost-button');
  button.disabled = true;
  button.textContent = 'Pricing…';
  try {
    const quote = await quoteRent(lastScan.result, ledgers);
    const rows = Object.entries(quote.byEntry).sort((a, b) => Number(BigInt(b[1]) - BigInt(a[1])));
    const total = BigInt(quote.totalRentStroops);
    const [topKey, topStroops] = rows[0] ?? ['', '0'];
    const share = total > 0n ? Number((BigInt(topStroops) * 100n) / total) : 0;
    panel.innerHTML = `
      <div class="row"><h3 style="margin:0">Rent to extend by ${esc(formatCount(quote.additionalLedgers))} more ledgers</h3></div>
      <p class="headline" style="font-family:var(--serif);font-size:var(--step-2)">${esc(approxXlm(quote.totalRentStroops))}
        <span class="small muted mono">(${esc(formatCount(Number(total)))} stroops)</span></p>
      <div class="table-wrap"><table><thead><tr><th scope="col">Entry</th><th scope="col">Rent</th><th scope="col">Share</th></tr></thead><tbody>
        ${rows
          .map(([key, stroops]) => {
            const pct = total > 0n ? Number((BigInt(stroops) * 100n) / total) : 0;
            // A share that rounds to zero is not zero; saying "0%" of a real amount is a small lie.
            const shown = pct === 0 && BigInt(stroops) > 0n ? '<1%' : `${pct}%`;
            return `<tr><td class="num">${esc(key.slice(0, 10))}…${esc(key.slice(-6))}</td><td class="num">${esc(approxXlm(stroops))}</td><td class="num">${shown}</td></tr>`;
          })
          .join('')}
      </tbody></table></div>
      ${
        share >= 60
          ? `<p class="small">${share}% of that rent is one entry (<span class="mono">${esc(topKey.slice(0, 10))}…${esc(topKey.slice(-6))}</span>). Code entries hold the Wasm and are usually the expensive one — and the one shared between contracts.</p>`
          : ''
      }
      <p class="small muted">Priced by simulating against the network at ledger ${esc(formatCount(quote.pricedAtLedger))}. Rent pricing varies with network state — a quote taken on another day has differed by ~18%. This is an estimate to budget against, not a quoted price.</p>
      <p class="small muted">Rent only. The CLI's total also carries the non-refundable resource and base fees; that assembly lives in the CLI and moves into core under #195.</p>
      ${quote.cappedEntries > 0 ? `<p class="small">⚠ ${quote.cappedEntries} entr${quote.cappedEntries === 1 ? 'y was' : 'ies were'} capped at the protocol maximum, so they get less than requested.</p>` : ''}`;
  } catch (error) {
    panel.innerHTML = `<p class="small">Could not price an extend: the network declined to simulate it. The TTL results above are unaffected.</p><p class="small muted">${esc((error as Error).message)}</p>`;
  }
}

function start(): void {
  $('scan-form').addEventListener('submit', (e) => void runScan(e));
  const fromQuery = new URLSearchParams(location.search).get('id');
  $<HTMLInputElement>('contract-id').value =
    fromQuery && isValidContractId(fromQuery) ? fromQuery : OUR_CONTRACTS[0].id;
  $('example-button').addEventListener('click', () => {
    $<HTMLInputElement>('contract-id').value = OUR_CONTRACTS[0].id;
  });
}

start();

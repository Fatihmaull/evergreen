/**
 * State archival reference. The network's own configuration, read live through
 * core — the page's whole point is that these numbers come from the chain, not
 * from documentation. The committed fallback is labelled with its ledger.
 */
import { archivalSettings } from '../lib/evergreen';
import { esc, formatCount } from '../lib/format';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

interface ArchivalFallback {
  capturedAt: string;
  settings: {
    maxEntryTtl: number;
    minTemporaryTtl: number;
    minPersistentTtl: number;
    observedAtLedger: number;
  };
}

function rows(settings: { maxEntryTtl: number; minTemporaryTtl: number; minPersistentTtl: number }): string {
  return `<div class="table-wrap"><table>
    <thead><tr><th scope="col">Parameter</th><th scope="col">Ledgers</th><th scope="col">About</th></tr></thead>
    <tbody>
      <tr><td class="num">max_entry_ttl</td><td class="num">${esc(formatCount(settings.maxEntryTtl))}</td>
        <td>No entry lives past this. Any figure above it is a live impossibility.</td></tr>
      <tr><td class="num">min_persistent_ttl</td><td class="num">${esc(formatCount(settings.minPersistentTtl))}</td>
        <td>Fresh instance, code and persistent entries start here — about seven days.</td></tr>
      <tr><td class="num">min_temporary_ttl</td><td class="num">${esc(formatCount(settings.minTemporaryTtl))}</td>
        <td>Fresh temporary entries start here — about an hour. Two orders of magnitude below the rest.</td></tr>
    </tbody></table></div>`;
}

async function load(): Promise<void> {
  const target = $('live-config');
  const note = $('live-note');
  try {
    const settings = await archivalSettings();
    target.innerHTML = rows(settings);
    note.textContent = 'Read live from testnet just now.';
  } catch {
    try {
      const response = await fetch('/assets/archival.json', { cache: 'no-store' });
      const fallback = (await response.json()) as ArchivalFallback;
      target.innerHTML = rows(fallback.settings);
      note.textContent = `The live read failed, so these are the values committed with this build, read at ledger ${formatCount(fallback.settings.observedAtLedger)}. They are not current.`;
    } catch {
      note.textContent = 'The live read failed and no committed reading is available. Nothing is shown rather than a remembered number.';
      target.innerHTML = '';
    }
  }
}

void load();

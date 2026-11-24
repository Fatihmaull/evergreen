/**
 * Blast radius, revamped (components.md § "Dashboard revamp", Blast radius):
 * the user's watched contracts on the left, the entries they run on on the
 * right, the largest shared entry as the one dominant figure, and a side
 * panel for whichever node is selected. Pure functions of one scan report,
 * so the map's rules are testable without a browser.
 *
 * Only contracts in the scan are drawn, so every count here is a floor:
 * contracts nobody listed may run on the same code. The note under the map
 * says so, and no sentence here claims an entry is unshared.
 */
import { xdr } from '@stellar/stellar-sdk';
import type { AssessedEntry, ScanReport } from './evergreen';
import { approxDateShort, esc, formatCount, short } from './format';
import { NOT_YET_AVAILABLE } from './overview-view';
import { entryView, type EntryView } from './view';

export type MapShow = 'code' | 'all';

/** The Wasm hash of a contract-code key, as hex; undefined for any other key. */
export function codeHashHex(key: string): string | undefined {
  try {
    const k = xdr.LedgerKey.fromXDR(key, 'base64');
    if (k.type !== 'contractCode') return undefined;
    const bytes: Uint8Array = k.contractCode.hash.value;
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

const KIND_SHORT: Record<string, string> = {
  instance: 'instance',
  code: 'code',
  persistent: 'persistent',
  temporary: 'temporary',
};

/** "code a41f…7be0" for code, "instance · name" for an instance, else kind and key. */
export function entryName(e: AssessedEntry, labels: ReadonlyMap<string, string>): string {
  if (e.entry.kind === 'code') {
    const hex = codeHashHex(e.key);
    return `code ${hex === undefined ? short(e.key, 4, 4) : short(hex, 4, 4)}`;
  }
  if (e.entry.kind === 'instance' && e.entry.contracts[0] !== undefined)
    return `instance · ${contractName(e.entry.contracts[0], labels)}`;
  return `${KIND_SHORT[e.entry.kind] ?? e.entry.kind} ${short(e.key, 4, 4)}`;
}

export function contractName(id: string, labels: ReadonlyMap<string, string>): string {
  return labels.get(id) ?? short(id, 4, 4);
}

/** "412,872 left · ~Dec 18", "archived · ended ~Nov 9", or why there is no figure. */
export function viewLine(v: EntryView): string {
  if (v.state === 'live')
    return `${formatCount(v.remainingLedgers)} left · ${approxDateShort(v.endsAt)}`;
  if (v.state === 'expired')
    return `${v.word}${v.endedOn === undefined ? '' : ` · ended ${approxDateShort(new Date(`${v.endedOn}T00:00:00Z`))}`}`;
  return 'no TTL returned';
}

/** Shared entries, the most contracts first, then the soonest to end. */
export function sharedEntries(rep: ScanReport, now = new Date()): AssessedEntry[] {
  const left = (e: AssessedEntry): number => {
    const v = entryView(e, now);
    return v.state === 'live' ? v.remainingLedgers : v.state === 'expired' ? -1 : Infinity;
  };
  return rep.entries
    .filter((e) => e.assessment.observedContractCount > 1)
    .sort(
      (a, b) =>
        b.assessment.observedContractCount - a.assessment.observedContractCount ||
        left(a) - left(b),
    );
}

/** The dominant element: the largest shared entry, or the plain fact that none is seen. */
export function largestSharedHtml(
  rep: ScanReport,
  labels: ReadonlyMap<string, string>,
  now = new Date(),
): string {
  const top = sharedEntries(rep, now)[0];
  const watched = rep.result.contracts.length;
  if (top === undefined) {
    return `<div><p class="label">Largest shared entry</p>
      <p><span class="next-figure ink">None seen</span></p>
      <p class="caption">none of these ${formatCount(watched)} contracts share an entry with another · contracts not drawn here may still share their code</p></div>`;
  }
  const v = entryView(top, now);
  const n = top.assessment.observedContractCount;
  const what =
    top.entry.kind === 'code'
      ? `run on ${entryName(top, labels)}`
      : `need ${entryName(top, labels)}`;
  const tail =
    v.state === 'expired'
      ? 'it is archived, so all of them have stopped'
      : `if it is archived, ${n === 2 ? 'both' : `all ${n}`} stop at once`;
  return `<div><p class="label">Largest shared entry</p>
    <p><span class="next-figure ink">${esc(formatCount(n))}</span><span class="next-unit">of your contracts ${esc(what)}</span></p>
    <p class="caption">${esc(viewLine(v))} · ${esc(tail)}</p></div>
    <button class="secondary" type="button" data-select="${esc(top.key)}">Open</button>`;
}

export interface MapLayout {
  readonly contracts: readonly string[];
  readonly entries: readonly AssessedEntry[];
  readonly width: number;
  readonly height: number;
  readonly cy: ReadonlyMap<string, number>;
  readonly ey: ReadonlyMap<string, { readonly y: number; readonly h: number }>;
}

const C_X = 0.5;
const C_W = 248;
const E_X = 448;
const E_W = 267.5;
const ROW = 72;
const NODE_H = 52;
const SHARED_H = 84;
const GAP = 20;

/**
 * Contracts that share an entry are drawn next to each other, and each entry
 * sits beside the contracts it serves (a shared one centred between them),
 * pushed down only as far as the one above it needs.
 */
export function layout(rep: ScanReport, show: MapShow): MapLayout {
  const entries = rep.entries.filter((e) => show === 'all' || e.entry.kind === 'code');
  const ids = rep.result.contracts.map((c) => c.id);
  const order: string[] = [];
  const byCount = [...entries].sort(
    (a, b) => b.assessment.observedContractCount - a.assessment.observedContractCount,
  );
  for (const e of byCount)
    for (const id of e.entry.contracts) if (ids.includes(id) && !order.includes(id)) order.push(id);
  for (const id of ids) if (!order.includes(id)) order.push(id);

  const cy = new Map<string, number>();
  order.forEach((id, i) => cy.set(id, 14 + i * ROW + NODE_H / 2));

  const centre = (e: AssessedEntry): number => {
    const ys = e.entry.contracts
      .map((id) => cy.get(id))
      .filter((y): y is number => y !== undefined);
    return ys.length === 0 ? 0 : ys.reduce((a, b) => a + b, 0) / ys.length;
  };
  const placed = [...entries].sort((a, b) => centre(a) - centre(b));
  const ey = new Map<string, { y: number; h: number }>();
  let bottom = 14 - GAP;
  for (const e of placed) {
    const h = e.assessment.observedContractCount > 1 ? SHARED_H : NODE_H;
    const y = Math.max(centre(e) - h / 2, bottom + GAP);
    ey.set(e.key, { y, h });
    bottom = y + h;
  }
  const height = Math.max(14 + order.length * ROW - GAP + 14, bottom + 14);
  return { contracts: order, entries: placed, width: 716, height, cy, ey };
}

type Shape = 'ok' | 'warn' | 'und' | 'exp';

function shapeOf(e: AssessedEntry | undefined, now: Date): Shape {
  if (e === undefined) return 'und';
  const v = entryView(e, now);
  if (v.state === 'expired') return 'exp';
  if (v.state === 'unread' || e.assessment.health === 'unknown') return 'und';
  return e.assessment.health === 'healthy' ? 'ok' : 'warn';
}

/** The same four shapes as the rest of the dashboard: colour is never the only cue. */
function shapeSvg(s: Shape, x: number, y: number): string {
  if (s === 'ok') return `<circle class="s-ok" cx="${x}" cy="${y}" r="4.5"/>`;
  if (s === 'warn')
    return `<path class="s-warn" d="M${x - 5} ${y + 4.5} L${x} ${y - 4.5} L${x + 5} ${y + 4.5} Z"/>`;
  if (s === 'und') return `<circle class="s-und" cx="${x}" cy="${y}" r="3.5"/>`;
  return `<rect class="s-exp" x="${x - 4}" y="${y - 4}" width="8" height="8"/>`;
}

/** What a selection lights up: the selected node, and everything one edge away. */
export function traced(
  rep: ScanReport,
  selected: string | undefined,
): { readonly contracts: ReadonlySet<string>; readonly entries: ReadonlySet<string> } {
  const contracts = new Set<string>();
  const entries = new Set<string>();
  if (selected === undefined) return { contracts, entries };
  const asEntry = rep.entries.find((e) => e.key === selected);
  if (asEntry !== undefined) {
    entries.add(asEntry.key);
    for (const id of asEntry.entry.contracts) contracts.add(id);
  } else if (rep.result.contracts.some((c) => c.id === selected)) {
    contracts.add(selected);
    for (const e of rep.entries) if (e.entry.contracts.includes(selected)) entries.add(e.key);
  }
  return { contracts, entries };
}

export function mapSvg(
  rep: ScanReport,
  labels: ReadonlyMap<string, string>,
  show: MapShow,
  selected: string | undefined,
  now = new Date(),
): string {
  const L = layout(rep, show);
  if (L.contracts.length === 0) return '';
  const on = traced(rep, selected);
  const any = selected !== undefined && (on.contracts.size > 0 || on.entries.size > 0);

  const edges = L.entries
    .flatMap((e) =>
      e.entry.contracts.map((id) => {
        const y1 = L.cy.get(id);
        const box = L.ey.get(e.key);
        if (y1 === undefined || box === undefined) return '';
        const y2 = box.y + box.h / 2;
        const lit = any && on.entries.has(e.key) && on.contracts.has(id);
        return `<path class="edge${lit ? ' on' : ''}" d="M${C_W} ${y1} C${C_W + 100} ${y1}, ${E_X - 100} ${y2}, ${E_X} ${y2}"/>`;
      }),
    )
    .join('');

  const instanceOf = (id: string): AssessedEntry | undefined =>
    rep.entries.find((e) => e.entry.kind === 'instance' && e.entry.contracts[0] === id);

  const cnodes = L.contracts
    .map((id) => {
      const c = L.cy.get(id)!;
      const y = c - NODE_H / 2;
      const inst = instanceOf(id);
      const v = inst === undefined ? undefined : entryView(inst, now);
      const line =
        v === undefined
          ? 'instance not read'
          : v.state === 'live'
            ? `instance ${formatCount(v.remainingLedgers)} left`
            : v.state === 'expired'
              ? `instance ${v.word}`
              : 'instance: no TTL returned';
      const dim = any && !on.contracts.has(id) ? ' dim-node' : '';
      const name = contractName(id, labels);
      return `<g class="cnode${dim}" data-select="${esc(id)}" tabindex="0" role="button" aria-label="${esc(`${name}, ${line}`)}">
        <rect class="node${selected === id ? ' sel' : ''}" x="${C_X}" y="${y}" width="${C_W}" height="${NODE_H}" rx="6"/>
        ${shapeSvg(shapeOf(inst, now), 19, y + 19)}
        <text class="n${selected === id ? ' inv' : ''}" x="32" y="${y + 23}">${esc(name)}</text>
        <text class="d${selected === id ? ' inv' : ''}" x="32" y="${y + 41}">${esc(line)}</text>
      </g>`;
    })
    .join('');

  const enodes = L.entries
    .map((e) => {
      const { y, h } = L.ey.get(e.key)!;
      const v = entryView(e, now);
      const sel = selected === e.key;
      const arch = v.state === 'expired';
      const inv = sel || arch ? ' inv' : '';
      const dim = any && !on.entries.has(e.key) ? ' dim-node' : '';
      const n = e.assessment.observedContractCount;
      const name = entryName(e, labels);
      const third =
        n > 1
          ? `<text class="d${inv}" x="${E_X + 16}" y="${y + 63}">shared by ${formatCount(n)} · they stop together</text>`
          : '';
      return `<g class="enode${dim}" data-select="${esc(e.key)}" tabindex="0" role="button" aria-label="${esc(`${name}, ${viewLine(v)}${n > 1 ? `, shared by ${n}` : ''}`)}">
        <rect class="node${sel ? ' sel' : arch ? ' arch' : ''}" x="${E_X}" y="${y}" width="${E_W}" height="${h}" rx="6"/>
        <text class="n${inv}" x="${E_X + 16}" y="${y + 23}">${esc(name)}</text>
        <text class="d${inv}" x="${E_X + 16}" y="${y + 41}">${esc(viewLine(v))}</text>${third}
      </g>`;
    })
    .join('');

  const label = `Your contracts on the left, the ${show === 'code' ? 'code entries' : 'entries'} they run on on the right.`;
  return `<svg class="graph map" viewBox="0 0 ${L.width} ${L.height}" role="group" aria-label="${esc(label)}">${edges}${cnodes}${enodes}</svg>`;
}

const kv = (pairs: readonly (readonly [string, string])[]): string =>
  `<dl class="kv">${pairs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

function chipFor(e: AssessedEntry, v: EntryView): string {
  if (v.state === 'expired')
    return `<span class="chip expired"><span class="shape"></span>${esc(v.word)}</span>`;
  if (v.state === 'unread' || e.assessment.health === 'unknown')
    return `<span class="chip undetermined"><span class="shape"></span>undetermined</span>`;
  if (e.assessment.health === 'healthy')
    return `<span class="chip healthy"><span class="shape"></span>healthy</span>`;
  return `<span class="chip ${e.assessment.health}"><span class="shape"></span>at risk</span>`;
}

export const cliFor = (ids: readonly string[]): string =>
  `npx @evergreen-stellar/cli scan ${ids.join(' ')}`;

const top = (title: string, sub: string): string =>
  `<div class="panel-top"><div><h2>${esc(title)}</h2><p class="note">${sub}</p></div><button class="close" type="button" data-panel-close>Close</button></div>`;

/** The side panel for a selected entry or contract; empty when nothing matches. */
export function blastPanelHtml(
  rep: ScanReport,
  labels: ReadonlyMap<string, string>,
  watched: ReadonlySet<string>,
  selected: string,
  now = new Date(),
): string {
  const e = rep.entries.find((x) => x.key === selected);
  if (e !== undefined) {
    const v = entryView(e, now);
    const name = entryName(e, labels);
    const facts: [string, string][] = [];
    if (v.state === 'live') {
      facts.push([
        'Ledgers left',
        `<span class="mono">${esc(formatCount(v.remainingLedgers))}</span>`,
      ]);
      facts.push([
        'Ends',
        `ledger <span class="mono">${esc(formatCount(v.endsAtLedger))}</span> · ${esc(approxDateShort(v.endsAt))}`,
      ]);
    } else if (v.state === 'expired') {
      facts.push(['State', `${esc(v.word)}: ${esc(v.reason)}`]);
    } else facts.push(['State', 'no TTL was returned for this entry']);
    facts.push(['Last extended', `<span class="note unavailable">${NOT_YET_AVAILABLE}</span>`]);
    const n = e.entry.contracts.length;
    const list = e.entry.contracts
      .map(
        (id) =>
          `<li><span>${esc(contractName(id, labels))}</span><span class="note">${watched.has(id) ? 'watched' : 'added here'}</span></li>`,
      )
      .join('');
    const sub =
      e.entry.kind === 'code' ? 'Wasm hash · contract code entry' : `${esc(e.entry.kind)} entry`;
    const note =
      n > 1
        ? `One extend of this entry covers ${n === 2 ? 'both' : `all ${n}`}. Each instance entry still needs its own.`
        : e.entry.kind === 'code'
          ? 'Only one of the contracts drawn here runs on it. Others not drawn may.'
          : '';
    return `${top(name.charAt(0).toUpperCase() + name.slice(1), sub)}
      <p>${chipFor(e, v)}</p>
      ${kv(facts)}
      <p class="panel-h">If it is archived, ${n > 1 ? 'these stop' : 'this stops'}</p>
      <ul class="activity">${list}</ul>
      ${note === '' ? '' : `<p class="note">${note}</p>`}
      <div class="actions"><button class="secondary copy" type="button" data-copy="${esc(cliFor(e.entry.contracts))}">Copy CLI command</button></div>`;
  }
  if (!rep.result.contracts.some((c) => c.id === selected)) return '';
  const runsOn = rep.entries
    .filter((x) => x.entry.contracts.includes(selected))
    .map((x) => {
      const v = entryView(x, now);
      return `<li><span>${esc(entryName(x, labels))}</span><span class="note">${esc(viewLine(v))}${
        x.assessment.observedContractCount > 1
          ? ` · shared by ${x.assessment.observedContractCount}`
          : ''
      }</span></li>`;
    })
    .join('');
  const open = watched.has(selected)
    ? `<a class="pill secondary" href="/dashboard/watchlist/?c=${encodeURIComponent(selected)}">Open in Contracts</a>`
    : '';
  return `${top(contractName(selected, labels), `<span class="mono addr">${esc(selected)}</span>`)}
    <p class="panel-h">Runs on</p>
    <ul class="activity">${runsOn}</ul>
    <div class="actions">${open}<button class="secondary copy" type="button" data-copy="${esc(cliFor([selected]))}">Copy CLI command</button></div>`;
}

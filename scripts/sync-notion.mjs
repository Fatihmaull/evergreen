#!/usr/bin/env node
/**
 * Generate the Notion mirror FROM `BACKLOG.md`, after a merge.
 *
 * Three reconciliation sweeps in three days established that hand-syncing does
 * not converge. The cause is structural rather than careless: two agents and a
 * human write the same mirror with no serialisation point, so every sweep fixes
 * a snapshot that is already stale. Some "anomalies" turned out to be nothing
 * but the lag — rows corrected themselves when a PR merged.
 *
 * So the mirror stops being written by sessions and starts being DERIVED. The
 * repo is canonical; this makes that mechanical instead of remembered, and the
 * trigger becomes the merge rather than somebody's memory of the merge.
 *
 * Three deliberate limits, each one a thing this script REFUSES to do:
 *
 *   - It writes STATUS and OWNER only. Those are the two fields `BACKLOG.md`
 *     actually determines. Notes, dates, Week and Kind are human fields, and
 *     the characteristic failure of a generator is flattening what people
 *     wrote by hand.
 *   - It never CREATES a row. An ID in `BACKLOG.md` with no Notion row is a
 *     real gap, and creating it would produce a row with an empty Task title
 *     that looks maintained. Reported instead.
 *   - It never DELETES a row. An ID that exists only in Notion is a phantom
 *     and must be resolved in `BACKLOG.md` by a person who knows which side is
 *     wrong. Deleting it would destroy the only evidence the two disagree.
 *
 * Papering over a disagreement is the one outcome worse than the disagreement,
 * because it removes the signal that anything is wrong.
 *
 * Dry-run by default, like everything else here that writes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { ANY_ROW, ROW, looksLikeTaskId, recurringIds } from './task-id.mjs';

/** Checkbox → Notion `Status`. These are the mirror's exact select options. */
const STATUS = {
  ' ': 'Pending',
  '~': 'In progress',
  x: 'Done',
  '!': 'Blocked',
  '-': 'Dropped',
};
/** Owner initial → Notion `Owner`. `Agent` exists in Notion and has no initial. */
const OWNER = { F: 'Fatih', R: 'Rakha', S: 'Shared' };

/**
 * Two IDs exist for one table and they are NOT interchangeable. Notion's newer
 * model puts data sources inside databases, so the mirror has both:
 *
 *   database    9aa56f25-12b6-48fc-a04a-8a0e21c727fa   /v1/databases/{id}/query      (2022-06-28)
 *   datasource  3e078dc6-0805-4b11-b970-6d544fa4a98c   /v1/data_sources/{id}/query   (2025-09-03)
 *
 * This shipped pairing the DATA SOURCE id with the DATABASE endpoint, which is
 * neither combination and would have 404'd on the first CI run. Both are named
 * here so the next person debugging an `object_not_found` can see immediately
 * which half is wrong, rather than re-deriving that these are different things.
 */
const DATABASE_ID = '9aa56f25-12b6-48fc-a04a-8a0e21c727fa';
const NOTION_VERSION = '2022-06-28';

/**
 * Parse, and PROVE the parse was complete.
 *
 * The first version of this function carried its own `[A-Z0-9-]+` and silently
 * dropped all 22 IDs with a letter suffix — `W4-D27-00b`, `W3-D21-01d`, and 20
 * more — while printing "✓ parsed 124 task rows". The sync would then have run
 * happily, left those rows permanently stale in Notion, and reported success.
 * It was caught by arithmetic, not by the check: three rows were marked done
 * and only two moved.
 *
 * A parser that skips quietly is worse than one that crashes, because it makes
 * partial work look finished. So the ID shape is imported rather than restated
 * (see `task-id.mjs`), and every row that OCCUPIES an ID slot must be accounted
 * for — an unrecognised one is a hard failure, not a silent omission.
 */
export function parseBacklog(text) {
  const rows = [];
  for (const m of text.matchAll(ROW)) {
    const status = STATUS[m[1]];
    if (!status) throw new Error(`Unknown checkbox "${m[1]}" on ${m[2]}`);
    rows.push({ id: m[2], status, owner: OWNER[m[3]] ?? undefined });
  }

  const parsed = new Set(rows.map((r) => r.id));
  const unrecognised = [...text.matchAll(ANY_ROW)]
    .map((m) => m[2])
    .filter((token) => !parsed.has(token) && looksLikeTaskId(token));
  if (unrecognised.length > 0)
    throw new Error(
      `${unrecognised.length} row(s) look like tasks but did not parse: ${unrecognised.join(', ')}.\n` +
        '  Either the ID is malformed, or `scripts/task-id.mjs` needs to learn a new shape.\n' +
        '  It is NOT acceptable to skip them — that is how 22 rows went unsynced.',
    );
  return rows;
}

/**
 * The diff, as a pure function, so it is testable without a token.
 *
 * `changes` are the only thing ever written. `missing` and `phantom` are
 * reported and deliberately left alone — see the header.
 */
export function planSync(backlogRows, notionRows, standingIds = []) {
  // Two mirror pages carrying the same task ID used to collapse into one: a
  // `Map` keeps the LAST, so the other page was never compared, never written,
  // and never mentioned. The run reported clean while a stale row diverged
  // forever. Found by Rakha reviewing #102.
  //
  // This is the mirror-side twin of the duplicate check already enforced on
  // `BACKLOG.md`, and its absence was an ASYMMETRY: one side of a two-way
  // reconciliation was guarded and the other was not.
  //
  // Ambiguous IDs are excluded from `changes` — writing to one of two candidate
  // pages is exactly the papering-over this script exists to refuse — and
  // reported with both page IDs so a person can delete the right one. Every
  // unambiguous row still syncs; one bad row must not strand the other 145.
  const seen = new Map();
  const ambiguous = new Map();
  for (const r of notionRows) {
    if (seen.has(r.id)) {
      const pages = ambiguous.get(r.id) ?? [seen.get(r.id).pageId];
      pages.push(r.pageId);
      ambiguous.set(r.id, pages);
    } else {
      seen.set(r.id, r);
    }
  }
  const byId = seen;
  const changes = [];
  const missing = [];
  for (const row of backlogRows) {
    if (ambiguous.has(row.id)) continue;
    const remote = byId.get(row.id);
    if (!remote) {
      missing.push(row.id);
      continue;
    }
    const fields = {};
    if (remote.status !== row.status) fields.Status = row.status;
    // An owner absent from BACKLOG.md is unstated, not "nobody". Clearing a
    // human-set owner because a row omitted the initial would be this script
    // overwriting information it does not have.
    if (row.owner !== undefined && remote.owner !== row.owner) fields.Owner = row.owner;
    if (Object.keys(fields).length > 0)
      changes.push({ id: row.id, pageId: remote.pageId, fields, was: remote });
  }
  // Standing obligations are KNOWN but carry no checkbox, so they are neither
  // phantoms nor rows this script has any status to write. Recognised and left
  // entirely alone — the mirror's own value for them is the human's.
  const known = new Set([...backlogRows.map((r) => r.id), ...standingIds]);
  const phantom = [...new Set(notionRows.filter((r) => !known.has(r.id)).map((r) => r.id))].filter(
    (id) => !ambiguous.has(id),
  );
  return {
    changes,
    missing,
    phantom,
    ambiguous: [...ambiguous].map(([id, pageIds]) => ({ id, pageIds })),
  };
}

/** Notion rejections report a status and a stable `code`, never a raw body. */
async function notion(path, init) {
  const token = process.env.NOTION_TOKEN;
  const response = await globalThis.fetch(`https://api.notion.com/v1/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      'notion-version': NOTION_VERSION,
      'content-type': 'application/json',
    },
  });
  if (response.status === 429) {
    const wait = Number(response.headers.get('retry-after') ?? '1');
    await new Promise((r) => globalThis.setTimeout(r, (wait + 1) * 1000));
    return notion(path, init);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    // `code` is a documented enum (`unauthorized`, `object_not_found`, ...).
    // The body is not echoed: it is provider output, and the convention here is
    // that provider output never reaches a log.
    // The two failures worth naming, because both look like "it is broken":
    //   unauthorized     -> NOTION_TOKEN missing, wrong, or revoked
    //   object_not_found -> the token is fine but the database was never SHARED
    //                       with the connection. A Notion token grants nothing
    //                       on its own; access is per-page and explicit.
    const hint =
      body.code === 'object_not_found'
        ? '\n  The token is valid but cannot see this database. Open it in Notion →' +
          ' ··· → Connections → add the connection. A token alone grants no access.'
        : body.code === 'unauthorized'
          ? '\n  NOTION_TOKEN is missing, wrong, or revoked.'
          : '';
    throw new Error(`Notion ${response.status} (${body.code ?? 'unknown'}) on ${path}${hint}`);
  }
  return body;
}

function plainText(property) {
  return (property?.rich_text ?? [])
    .map((t) => t.plain_text)
    .join('')
    .trim();
}

async function readMirror() {
  const rows = [];
  let cursor;
  do {
    const page = await notion(`databases/${DATABASE_ID}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    for (const result of page.results) {
      const id = plainText(result.properties.ID);
      if (!id) continue; // A row with no ID cannot be matched, and guessing is worse.
      rows.push({
        id,
        pageId: result.id,
        status: result.properties.Status?.select?.name,
        owner: result.properties.Owner?.select?.name,
      });
    }
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function main() {
  const backlog = readFileSync(
    fileURLToPath(new globalThis.URL('../BACKLOG.md', import.meta.url)),
    'utf8',
  );
  const rows = parseBacklog(backlog);

  const duplicates = rows.map((r) => r.id).filter((id, i, all) => all.indexOf(id) !== i);
  if (duplicates.length > 0) {
    // Fatal rather than reported: with a duplicate ID the mirror's target is
    // ambiguous, and this checker found exactly this defect on its first run.
    console.error(`✖ duplicate task IDs in BACKLOG.md: ${[...new Set(duplicates)].join(', ')}`);
    process.exit(1);
  }

  console.log(`✓ parsed ${rows.length} task rows from BACKLOG.md`);
  for (const status of Object.values(STATUS)) {
    const n = rows.filter((r) => r.status === status).length;
    if (n > 0) console.log(`    ${status.padEnd(12)} ${n}`);
  }

  if (!process.env.NOTION_TOKEN) {
    console.log('\n  Parse only — no NOTION_TOKEN, so the mirror was not read or written.');
    console.log('  This is the gate that runs on every PR; the write runs after merge.');
    return;
  }

  const mirror = await readMirror();
  const { changes, missing, phantom, ambiguous } = planSync(rows, mirror, recurringIds(backlog));
  console.log(`\n✓ read ${mirror.length} rows from the Notion mirror`);

  for (const c of changes) {
    const what = Object.entries(c.fields)
      .map(([k, v]) => `${k}: ${c.was[k.toLowerCase()] ?? '—'} → ${v}`)
      .join(', ');
    console.log(`  ${c.id}  ${what}`);
  }
  if (missing.length > 0)
    console.log(`\n  ⚠ ${missing.length} in BACKLOG.md with no Notion row: ${missing.join(', ')}`);
  if (phantom.length > 0)
    console.log(`  ⚠ ${phantom.length} in Notion with no BACKLOG.md row: ${phantom.join(', ')}`);
  for (const a of ambiguous)
    console.error(
      `  ✖ ${a.id} appears on ${a.pageIds.length} Notion pages: ${a.pageIds.join(', ')}\n` +
        '    Not written — the target is ambiguous. Delete the duplicate page in Notion.',
    );
  if (missing.length > 0 || phantom.length > 0)
    console.log(
      '  Neither is created or deleted here — both need a person to say which side is wrong.',
    );

  if (process.env.NOTION_SYNC !== 'apply') {
    console.log(
      `\n  Dry run. ${changes.length} row(s) would change. Set NOTION_SYNC=apply to write.`,
    );
    return;
  }

  for (const c of changes) {
    const properties = {};
    if (c.fields.Status) properties.Status = { select: { name: c.fields.Status } };
    if (c.fields.Owner) properties.Owner = { select: { name: c.fields.Owner } };
    await notion(`pages/${c.pageId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
  }
  console.log(`\n✓ applied ${changes.length} row update(s). Status and Owner only.`);
  if (ambiguous.length > 0) process.exit(1);
}

// Importable for tests without running the sync.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}

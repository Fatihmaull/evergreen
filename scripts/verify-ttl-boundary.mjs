// W1-D4-13: audit captured RPC evidence offline. This never submits a transaction.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

export function verifyBoundary(responses, metadata) {
  const { key, liveUntilLedgerSeq: boundary } = metadata;
  if (typeof key !== 'string' || !key || !Number.isSafeInteger(boundary) || boundary < 1) {
    throw new Error('A ledger key and a positive integer liveUntilLedgerSeq are required');
  }

  const observations = new Map();
  for (const response of responses) {
    if (response.error || !response.result) throw new Error('An RPC error is not expiry evidence');
    const { latestLedger: ledger, entries = [] } = response.result;
    if (!Number.isSafeInteger(ledger) || !Array.isArray(entries)) {
      throw new Error('Malformed getLedgerEntries result');
    }
    const entry = entries.find((candidate) => candidate.key === key);
    if (entry && entry.liveUntilLedgerSeq !== boundary) {
      throw new Error('The observed TTL changed; this is not an untouched expiry experiment');
    }
    const present = Boolean(entry);
    if (observations.has(ledger) && observations.get(ledger) !== present) {
      throw new Error('Conflicting observations at the same ledger');
    }
    observations.set(ledger, present);
  }

  const lastLive = observations.get(boundary);
  const nextLedger = observations.get(boundary + 1);
  const contradiction = [...observations].some(
    ([ledger, present]) => (ledger <= boundary && !present) || (ledger > boundary && present),
  );
  const status = contradiction
    ? 'contradicted'
    : lastLive === true && nextLedger === false
      ? 'confirmed'
      : 'inconclusive';

  return {
    status,
    liveUntilLedgerSeq: boundary,
    presentAtBoundary: lastLive ?? null,
    presentAtNextLedger: nextLedger ?? null,
    distinctLedgers: observations.size,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/verify-ttl-boundary.mjs <evidence-directory>');
    process.exitCode = 1;
  } else {
    const directory = resolve(process.argv[2]);
    const metadata = JSON.parse(
      readFileSync(resolve(directory, 'boundary-observation.json'), 'utf8'),
    );
    const files = readdirSync(directory).filter((name) => /^boundary-ledger-\d+\.json$/.test(name));
    const responses = files.map((name) =>
      JSON.parse(readFileSync(resolve(directory, name), 'utf8')),
    );
    const result = verifyBoundary(responses, metadata);
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === 'confirmed' ? 0 : 2;
  }
}

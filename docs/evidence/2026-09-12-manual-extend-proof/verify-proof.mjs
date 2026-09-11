// Offline verification of the captured proof; never submits or reads a secret.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
const require=createRequire(new URL('../../../packages/cli/package.json',import.meta.url));
const {TransactionBuilder,Networks,xdr}=require('@stellar/stellar-sdk');
const base=process.argv[2] ? pathToFileURL(resolve(process.argv[2])+'/') : new URL('.',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,base)));
const attempt=read('send-attempt.json');
const report=read('live-result.json').result;
assert.equal(report.ok,true);
assert.equal(report.mode,'live');
assert.equal(report.records.length,1);
assert.deepEqual(report.skipped,[]);
assert.deepEqual(report.unattempted,[]);
const record=report.records[0];
const sends=readdirSync(new URL('live/',base)).filter(n=>n.endsWith('sendTransaction-request.json'));
assert.equal(sends.length,1);
const sent=TransactionBuilder.fromXDR(read('live/'+sends[0]).params.transaction,Networks.TESTNET);
assert.equal(Buffer.from(sent.hash()).toString('hex'),attempt.hash);
assert.equal(sent.source,attempt.source);
assert.equal(sent.operations.length,1);
assert.equal(sent.operations[0].type,'extendFootprintTtl');
assert.equal(sent.operations[0].extendTo,attempt.before.endsAt-attempt.before.ledger+1000);
assert.equal(sent.signatures.length,1);
const footprint=sent.toEnvelope().value.tx.ext.value.resources.footprint;
assert.deepEqual(footprint.readOnly.map(k=>k.toXDR('base64')),[attempt.key]);
assert.equal(footprint.readWrite.length,0);
const confirmed=readdirSync(new URL('live/',base)).filter(n=>n.endsWith('getTransaction-response.json'))
  .map(n=>read('live/'+n).result).find(r=>r.status==='SUCCESS');
assert(confirmed);
assert.equal(Buffer.from(TransactionBuilder.fromXDR(confirmed.envelopeXdr,Networks.TESTNET).hash()).toString('hex'),attempt.hash);
assert.equal(record.outcome,'succeeded');
assert.equal(record.transactionHash,attempt.hash);
assert(record.after.observedAtLedger>=confirmed.ledger);
assert.equal(record.after.endsAtLedger,confirmed.ledger+attempt.target);
assert(record.after.endsAtLedger>record.before.endsAtLedger);
const readPhase=phase=>readdirSync(new URL(phase+'/',base)).filter(n=>n.endsWith('getLedgerEntries-response.json'))
  .map(n=>read(phase+'/'+n).result).find(r=>r.entries?.some(e=>e.key===attempt.key));
const before=readPhase('before'),after=readPhase('after');
assert(before.latestLedger<=attempt.before.ledger);
assert(after.latestLedger>=confirmed.ledger);
assert.equal(before.entries.find(e=>e.key===attempt.key).liveUntilLedgerSeq,record.before.endsAtLedger);
assert.equal(after.entries.find(e=>e.key===attempt.key).liveUntilLedgerSeq,record.after.endsAtLedger);
for(const phase of ['before','after']) assert.equal(read(phase+'/run.json').exitCode,0);
const controlsBefore=read('controls-before/parsed.json'),controlsAfter=read('controls-after/parsed.json');
assert(controlsBefore.ledger<=attempt.before.ledger && controlsAfter.ledger>=confirmed.ledger);
assert.equal(controlsBefore.entries.length,5);
assert.deepEqual(controlsBefore.entries,controlsAfter.entries);
// Bind parsed controls back to each unedited response and exact requested key set.
for(const phase of ['controls-before','controls-after']) {
  const req=read(phase+'/02-getLedgerEntries-request.json').params.keys;
  const raw=read(phase+'/02-getLedgerEntries-response.json').result;
  const parsed=read(phase+'/parsed.json');
  assert.equal(raw.latestLedger,parsed.ledger);
  assert.deepEqual(raw.entries.map(e=>e.key).sort(),[...req].sort());
  assert.deepEqual(raw.entries.map(e=>({key:e.key,endsAt:e.liveUntilLedgerSeq})),parsed.entries);
}
for(const file of ['before.jpg','after.jpg','explorer.jpg']) {
  const bytes=readFileSync(new URL(file,base));
  assert.equal(bytes.subarray(0,3).toString('hex'),'ffd8ff');
  assert(bytes.length>10000);
}
const feeCharged=xdr.TransactionResult.fromXDR(confirmed.resultXdr,'base64').feeCharged.toString();
assert(BigInt(feeCharged)<=BigInt(attempt.fee) && BigInt(attempt.fee)<=25000n);
const result={transactionHash:attempt.hash,inclusionLedger:confirmed.ledger,
  requestedAdditionalLedgers:1000,resolvedTarget:attempt.target,
  beforeExpiry:record.before.endsAtLedger,afterExpiry:record.after.endsAtLedger,
  expiryIncrease:record.after.endsAtLedger-record.before.endsAtLedger,
  beforeScanLedger:before.latestLedger,afterScanLedger:after.latestLedger,
  feeCeilingStroops:'25000',envelopeFeeStroops:attempt.fee,feeChargedStroops:feeCharged,
  sends:1,protectedControlEntriesUnchanged:5,screenshots:['before.jpg','after.jpg','explorer.jpg']};
writeFileSync(new URL('verification.json',base),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));

// Offline verification of the captured proof; never submits or reads a secret.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { URL, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { createHash } from 'node:crypto';
import { verifyEvidenceIntegrity } from '../../../scripts/verify-evidence-integrity.mjs';
const base=process.argv[2] ? pathToFileURL(resolve(process.argv[2])+'/') : new URL('.',import.meta.url);
console.error(`Evidence integrity verified: ${verifyEvidenceIntegrity(base)} files`);
const require=createRequire(new URL('../../../packages/cli/package.json',import.meta.url));
const {TransactionBuilder,Networks,Keypair,xdr}=require('@stellar/stellar-sdk');
const approvedPayer='GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';
const approvedKey='AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB';
const approvedContract='CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const read=name=>JSON.parse(readFileSync(new URL(name,base)));
const attempt=read('send-attempt.json');
assert.equal(attempt.source,approvedPayer,'attempt payer must match approved payer');
assert.equal(attempt.key,approvedKey,'attempt key must match approved A instance');
const report=read('live-result.json').result;
assert.equal(report.ok,true);
assert.equal(report.mode,'live');
assert.equal(report.records.length,1);
assert.deepEqual(report.skipped,[]);
assert.deepEqual(report.unattempted,[]);
const record=report.records[0];
assert.equal(record.payer,approvedPayer,'record payer must match approved payer');
assert.equal(record.entryKey,approvedKey);
assert.deepEqual(record.contracts,[approvedContract]);
assert.deepEqual(record.signer,{kind:'ed25519',account:approvedPayer});
assert.equal(record.before.observedAtLedger,attempt.before.ledger);
assert.equal(record.before.endsAtLedger,attempt.before.endsAt);
assert.equal(record.extendToLedgers,attempt.target);
const sends=readdirSync(new URL('live/',base)).filter(n=>n.endsWith('sendTransaction-request.json'));
assert.equal(sends.length,1);
const sent=TransactionBuilder.fromXDR(read('live/'+sends[0]).params.transaction,Networks.TESTNET);
assert.equal(Buffer.from(sent.hash()).toString('hex'),attempt.hash);
assert.equal(sent.source,attempt.source);
assert.equal(sent.fee,attempt.fee,'envelope fee must match attempt metadata');
assert.equal(sent.sequence,attempt.sequence);
assert.equal(sent.memo.type,'none');
assert.equal(sent.operations.length,1);
assert.equal(sent.operations[0].type,'extendFootprintTtl');
assert.equal(sent.operations[0].source,undefined);
assert.equal(sent.operations[0].extendTo,attempt.target);
assert.equal(sent.operations[0].extendTo,attempt.before.endsAt-attempt.before.ledger+1000);
assert.equal(sent.signatures.length,1);
assert(Keypair.fromPublicKey(approvedPayer).verify(sent.hash(),sent.signatures[0].signature),'sent signature must verify');
const footprint=sent.toEnvelope().value.tx.ext.value.resources.footprint;
assert.deepEqual(footprint.readOnly.map(k=>k.toXDR('base64')),[attempt.key]);
assert.equal(footprint.readWrite.length,0);
const confirmed=readdirSync(new URL('live/',base)).filter(n=>n.endsWith('getTransaction-response.json'))
  .map(n=>read('live/'+n).result).find(r=>r.status==='SUCCESS');
assert(confirmed);
assert.equal(confirmed.envelopeXdr,sent.toXDR(),'confirmed envelope must equal signed sent envelope');
assert.equal(Buffer.from(TransactionBuilder.fromXDR(confirmed.envelopeXdr,Networks.TESTNET).hash()).toString('hex'),attempt.hash);
const receipt=xdr.TransactionResult.fromXDR(confirmed.resultXdr,'base64');
assert.equal(receipt.result.type,'txSuccess','raw result must confirm transaction success');
assert.equal(record.outcome,'succeeded');
assert.equal(record.transactionHash,attempt.hash);
assert(record.after.observedAtLedger>=confirmed.ledger);
assert.equal(record.after.endsAtLedger,confirmed.ledger+attempt.target);
assert(record.after.endsAtLedger>record.before.endsAtLedger);
// The receipt itself must record this key's TTL update, beyond sampled post-state.
const meta=xdr.TransactionMeta.fromXDR(confirmed.resultMetaXdr,'base64');
assert.equal(meta.type,'v4');
assert.equal(meta.value.operations.length,1);
const changes=meta.value.operations[0].changes;
assert.deepEqual(changes.map(c=>c.type),['ledgerEntryState','ledgerEntryUpdated']);
const expectedKeyHash=createHash('sha256').update(Buffer.from(approvedKey,'base64')).digest('hex');
for (const c of changes) {
  assert.equal(c.value.data.type,'ttl');
  assert.equal(c.value.data.value.keyHash.toXDR('hex'),expectedKeyHash);
}
assert.equal(changes[0].value.data.value.liveUntilLedgerSeq,record.before.endsAtLedger);
assert.equal(changes[1].value.data.value.liveUntilLedgerSeq,record.after.endsAtLedger);
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
const feeCharged=receipt.feeCharged.toString();
assert(BigInt(feeCharged)>=0n);
assert(BigInt(feeCharged)<=BigInt(attempt.fee) && BigInt(attempt.fee)<=25000n);
const result={transactionHash:attempt.hash,inclusionLedger:confirmed.ledger,
  requestedAdditionalLedgers:1000,resolvedTarget:attempt.target,
  beforeExpiry:record.before.endsAtLedger,afterExpiry:record.after.endsAtLedger,
  expiryIncrease:record.after.endsAtLedger-record.before.endsAtLedger,
  beforeScanLedger:before.latestLedger,afterScanLedger:after.latestLedger,
  feeCeilingStroops:'25000',envelopeFeeStroops:attempt.fee,feeChargedStroops:feeCharged,
  sends:1,receiptTtlChangeVerified:true,protectedControlEntriesUnchanged:5,screenshots:['before.jpg','after.jpg','explorer.jpg']};
console.log(JSON.stringify(result,null,2));

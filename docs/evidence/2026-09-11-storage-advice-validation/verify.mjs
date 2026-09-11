import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import process from 'node:process';
import {createHash} from 'node:crypto';
globalThis.fetch=async()=>{throw new Error('Offline verifier cannot access the network');};
const {scanContracts,scanContract,coverageIssues,analyzeStorage,parseStateArchivalSettings}=await import('../../../packages/core/dist/index.js');
const {exitCodeFor}=await import('../../../packages/cli/dist/scan.js');
const {xdr,scValToNative}=await import('@stellar/stellar-sdk');
const base=new URL('.',import.meta.url).pathname;
function read(path){return JSON.parse(readFileSync(`${base}/${path}`,'utf8'));}
const input=read('input.json');const verification=read('verification.json');
const registry=read('provenance/blend-testnet.contracts.json');
const provenance=read('provenance.json');
assert.equal(createHash('sha256').update(readFileSync(`${base}/provenance/blend-testnet.contracts.json`)).digest('hex'),provenance.registry.sha256,'Registry snapshot checksum mismatch');
assert.equal(input.blend.contract.id,registry.ids.TestnetV2,'Contract must match publisher registry');
assert.equal(verification.blend.contract,registry.ids.TestnetV2);
assert.equal(verification.blend.asset,registry.ids.USDC);
assert.equal(verification.blend.registryCommit,provenance.registry.commit);
assert.equal(verification.blend.storageSourceCommit,provenance.storageSchema.commit);
assert.equal(read('network/01-getNetwork-request.json').method,'getNetwork');
assert.equal(read('network/01-getNetwork-response.json').result.passphrase,'Test SDF Network ; September 2015');
const settingsRequest=read('network/02-getLedgerEntries-request.json');
assert.equal(settingsRequest.method,'getLedgerEntries');assert.deepEqual(settingsRequest.params.keys,['AAAACAAAAAo=']);
const settingsResponse=read('network/02-getLedgerEntries-response.json').result;
assert.equal(settingsResponse.entries.length,1);assert.equal(settingsResponse.entries[0].key,'AAAACAAAAAo=');
assert.deepEqual(input.settings,parseStateArchivalSettings(settingsResponse.entries[0].xdr,settingsResponse.latestLedger),'Settings must match raw RPC');
const matches=[];
for(const name of ['bc','blend']){
  const requests=readdirSync(`${base}/${name}`).filter(f=>f.endsWith('-request.json')).sort();
  const rawRows=new Map();let cursor=0;
  const reader={read:async(keys)=>{
    const file=requests[cursor++];assert(file,'Unexpected extra read');
    const request=read(`${name}/${file}`);assert.equal(request.method,'getLedgerEntries');
    assert.deepEqual(keys,request.params.keys);
    const response=read(`${name}/${file.replace('-request.json','-response.json')}`);
    for(const row of response.result.entries){
      assert(keys.includes(row.key));assert(!rawRows.has(row.key));
      rawRows.set(row.key,{...row,observedAtLedger:response.result.latestLedger});
    }
    return {latestLedger:response.result.latestLedger,entries:response.result.entries.map(row=>({key:row.key,entryXdr:row.xdr,liveUntilLedgerSeq:row.liveUntilLedgerSeq}))};
  }};
  const scanned=name==='bc'?await scanContracts(reader,input.bc):await scanContract(reader,input.blend.contract,input.blend.dataKeys);
  assert.equal(cursor,requests.length);
  const scan={...scanned,issues:[...scanned.issues,...coverageIssues(scanned)]};
  const expected=read(`${name}/report.json`);
  assert.deepEqual(scan.entries,expected.entries);assert.deepEqual(scan.issues,expected.issues);
  assert.deepEqual(scan.contracts,expected.contracts);assert.deepEqual(scan.coverage,expected.coverage);
  for(const [key,entry] of Object.entries(scan.entries)){
    const row=rawRows.get(key);assert(row);assert.equal(entry.observedAtLedger,row.observedAtLedger);
    assert.equal(entry.ttl.endsAtLedger,row.liveUntilLedgerSeq);
    assert.equal(entry.ttl.remainingLedgers,row.liveUntilLedgerSeq-row.observedAtLedger);
  }
  const advice=analyzeStorage(scan,{settings:input.settings});assert.deepEqual(advice,expected.optimization);
  assert(advice.findings.every(f=>f.currentRent.status==='unavailable'));
  assert(!advice.findings.some(f=>scan.entries[f.entryKey].kind==='instance'));
  if(name==='blend'){
    for(const [index,key] of input.blend.dataKeys.entries()){
      const dataKey=xdr.LedgerKey.fromXDR(key,'base64').contractData;
      assert.equal(dataKey.durability.name,'persistent');
      assert.deepEqual(scValToNative(dataKey.key),[['ResConfig',registry.ids.USDC],['ResData',registry.ids.USDC]][index]);
    }
    assert.equal(input.blend.dataKeys.length,2);
    const [config,data]=input.blend.dataKeys.map(key=>scValToNative(xdr.LedgerEntryData.fromXDR(rawRows.get(key).xdr,'base64').contractData.val));
    assert(['c_factor','l_factor','supply_cap','enabled'].every(k=>k in config));
    assert(['b_supply','d_supply','backstop_credit'].every(k=>k in data));
    const codeKey=Object.keys(scan.entries).find(key=>scan.entries[key].kind==='code');
    const observedHash=Buffer.from(xdr.LedgerKey.fromXDR(codeKey,'base64').contractCode.hash.value).toString('hex');
    assert.equal(observedHash,registry.hashes.lendingPoolV2,'Observed Wasm must match publisher registry');
    assert.equal(observedHash,verification.blend.wasmHash);
    assert.equal(Object.keys(scan.entries).length,4);
  }else{
    assert.equal(scan.contracts.length,2);assert.equal(Object.keys(scan.entries).length,5);
    const requested=requests.flatMap(file=>read(`${name}/${file}`).params.keys);
    assert.equal(requested.length,7);assert.equal(new Set(requested).size,7);
    const shared=advice.findings.filter(f=>f.code==='shared-code-dependency');
    assert.equal(shared.length,1);assert.deepEqual([...shared[0].knownConsumers].sort(),scan.contracts.map(c=>c.id).sort());
  }
  assert.equal(advice.findings.length,3);
  assert.equal(advice.findings.filter(f=>f.code==='durability-review').length,2);
  assert.equal(advice.findings.filter(f=>f.code==='temporary-retention').length,0);
  assert.equal(exitCodeFor(scan,17280),name==='bc'?3:0);
  assert.equal(exitCodeFor(scan,17280),verification[name].exitCode);
  matches.push({case:name,rawEntriesMatched:rawRows.size,findings:advice.findings.length,exitCode:exitCodeFor(scan,17280)});
}
const post=read('bc-post/07-getLedgerEntries-response.json').result;
const bc=read('bc/report.json');
const postRequest=read('bc-post/07-getLedgerEntries-request.json');
assert.equal(postRequest.method,'getLedgerEntries');
const expectedKeys=Object.keys(bc.entries).sort();
assert.deepEqual([...postRequest.params.keys].sort(),expectedKeys);
assert.deepEqual(post.entries.map(row=>row.key).sort(),expectedKeys,'Post-read must cover every original entry exactly once');
assert(Number.isSafeInteger(post.latestLedger));
assert(post.latestLedger>=Math.max(...Object.values(bc.entries).map(entry=>entry.observedAtLedger)),'Post-read ledger must not precede initial read');
for(const row of post.entries)assert.equal(row.liveUntilLedgerSeq,bc.entries[row.key].ttl.endsAtLedger);
const result={verifiedOffline:true,cases:matches,bcExpiryUnchanged:true,noNetwork:true,blendPersistentPayloadMatchesDocumentedRole:true};
writeFileSync(`${base}/offline-verification.json`,JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result,null,2)+'\n');

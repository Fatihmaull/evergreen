import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import assert from 'node:assert/strict';
import process from 'node:process';
globalThis.fetch=async()=>{throw new Error('Offline verifier cannot access the network');};
const {scanContracts,scanContract,coverageIssues,analyzeStorage}=await import('../../../packages/core/dist/index.js');
const {exitCodeFor}=await import('../../../packages/cli/dist/scan.js');
const {xdr,scValToNative}=await import('@stellar/stellar-sdk');
const base=new URL('.',import.meta.url).pathname;
function read(path){return JSON.parse(readFileSync(`${base}/${path}`,'utf8'));}
const input=read('input.json');const verification=read('verification.json');
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
  for(const [key,entry] of Object.entries(scan.entries)){
    const row=rawRows.get(key);assert(row);assert.equal(entry.observedAtLedger,row.observedAtLedger);
    assert.equal(entry.ttl.endsAtLedger,row.liveUntilLedgerSeq);
    assert.equal(entry.ttl.remainingLedgers,row.liveUntilLedgerSeq-row.observedAtLedger);
  }
  const advice=analyzeStorage(scan,{settings:input.settings});assert.deepEqual(advice,expected.optimization);
  assert(advice.findings.every(f=>f.currentRent.status==='unavailable'));
  assert(!advice.findings.some(f=>scan.entries[f.entryKey].kind==='instance'));
  if(name==='blend'){
    const [config,data]=input.blend.dataKeys.map(key=>scValToNative(xdr.LedgerEntryData.fromXDR(rawRows.get(key).xdr,'base64').contractData.val));
    assert(['c_factor','l_factor','supply_cap','enabled'].every(k=>k in config));
    assert(['b_supply','d_supply','backstop_credit'].every(k=>k in data));
    const codeKey=Object.keys(scan.entries).find(key=>scan.entries[key].kind==='code');
    assert.equal(Buffer.from(xdr.LedgerKey.fromXDR(codeKey,'base64').contractCode.hash.value).toString('hex'),verification.blend.wasmHash);
  }
  matches.push({case:name,rawEntriesMatched:rawRows.size,findings:advice.findings.length,exitCode:exitCodeFor(scan,17280)});
}
const post=read('bc-post/07-getLedgerEntries-response.json').result;
const bc=read('bc/report.json');
for(const row of post.entries)assert.equal(row.liveUntilLedgerSeq,bc.entries[row.key].ttl.endsAtLedger);
const result={verifiedOffline:true,cases:matches,bcExpiryUnchanged:true,noNetwork:true,blendPersistentPayloadMatchesDocumentedRole:true};
writeFileSync(`${base}/offline-verification.json`,JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result,null,2)+'\n');

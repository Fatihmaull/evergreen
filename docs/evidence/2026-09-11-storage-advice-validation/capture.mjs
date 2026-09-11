import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { URL } from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Buffer } from 'node:buffer';

const base=new URL('.',import.meta.url).pathname;
if(existsSync(`${base}/verification.json`))throw new Error('Copy the evidence directory before repeating; original captures must not be overwritten');
let phase='network',count=0;
const calls=[];
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
  const address=String(input instanceof globalThis.Request?input.url:input);
  assert.equal(address,'https://soroban-testnet.stellar.org/');
  const body=typeof init?.body==='string'?init.body:await input.clone().text();
  const request=JSON.parse(body);
  assert(['getNetwork','getLedgerEntries'].includes(request.method),'Only read RPC is permitted');
  mkdirSync(`${base}/${phase}`,{recursive:true});
  const prefix=`${base}/${phase}/${String(++count).padStart(2,'0')}-${request.method}`;
  writeFileSync(`${prefix}-request.json`,body);
  const response=await fetchOriginal(input,init);
  writeFileSync(`${prefix}-response.json`,await response.clone().text());
  calls.push({phase,method:request.method,keys:request.params?.keys??[]});
  return response;
};
const {Address,rpc,xdr,Networks}=await import('@stellar/stellar-sdk');
const {createRpcReader,scanContracts,scanContract,analyzeStorage,coverageIssues,readStateArchivalSettings}=await import('../../../packages/core/dist/index.js');
const {formatStorageAdvice}=await import('../../../packages/cli/dist/optimizer.js');
const {formatHuman,exitCodeFor,healthReport}=await import('../../../packages/cli/dist/scan.js');
const server=new rpc.Server('https://soroban-testnet.stellar.org',{timeout:15000});
assert.equal((await server.getNetwork()).passphrase,Networks.TESTNET);
const settings=await readStateArchivalSettings(server);
const reader=createRpcReader(server);
const B='CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const C='CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';
const template=JSON.parse(readFileSync(new URL('../../../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json',import.meta.url),'utf8')).result.entries;
const dataTemplates=template.slice(2).map(row=>xdr.LedgerKey.fromXDR(row.key,'base64').contractData);
function keyFor(contract,key,durability){
  return xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData({contract:Address.fromString(contract).toScAddress(),key,durability})).toXDR('base64');
}
function bcKeys(contract){return dataTemplates.map(data=>keyFor(contract,data.key,data.durability));}
const registry=JSON.parse(readFileSync(`${base}/provenance/blend-testnet.contracts.json`,'utf8'));
const pool=registry.ids.TestnetV2;
const persistent=dataTemplates.find(t=>t.durability.name==='persistent').durability;
const blendKeys=['ResConfig','ResData'].map(tag=>keyFor(pool,xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(tag),Address.fromString(registry.ids.USDC).toScVal()]),persistent));
writeFileSync(`${base}/input.json`,JSON.stringify({bc:[B,C,B].map(id=>({contract:{id},dataKeys:bcKeys(id)})),blend:{contract:{id:pool},dataKeys:blendKeys},settings},null,2));

function save(name,scanned){
  const scan={...scanned,issues:[...scanned.issues,...coverageIssues(scanned)]};
  const optimization=analyzeStorage(scan,{settings});
  const report={...scan,health:healthReport(scan,17280),optimization};
  writeFileSync(`${base}/${name}/report.json`,JSON.stringify(report,null,2));
  writeFileSync(`${base}/${name}/human.txt`,formatHuman(scan,new Date(),{thresholdLedgers:17280})+'\n\n'+formatStorageAdvice(optimization).join('\n')+'\n');
  return {scan,optimization,exitCode:exitCodeFor(scan,17280)};
}
phase='bc';
const bc=save('bc',await scanContracts(reader,[B,C,B].map(id=>({contract:{id},dataKeys:bcKeys(id)}))));
assert.equal(bc.scan.contracts.length,2);
const bcCode=Object.entries(bc.scan.entries).filter(([,entry])=>entry.kind==='code');
assert.equal(bcCode.length,1);assert.deepEqual([...bcCode[0][1].contracts].sort(),[B,C].sort());
assert.equal(bc.optimization.findings.filter(f=>f.code==='shared-code-dependency').length,1);
assert.equal(bc.optimization.findings.filter(f=>f.code==='durability-review').length,2);
assert.equal(bc.optimization.findings.filter(f=>f.code==='temporary-retention').length,0);
const bcRequested=calls.filter(c=>c.phase==='bc').flatMap(c=>c.keys);
assert.equal(new Set(bcRequested).size,bcRequested.length,'duplicate requested ledger key');
phase='blend';
const blend=save('blend',await scanContract(reader,{id:pool},blendKeys));
assert.equal(Object.keys(blend.scan.entries).length,4,'expected live instance, code and two known persistent keys');
assert.equal(blend.scan.issues.filter(i=>i.kind==='entry-not-found'||i.kind==='rpc-error'||i.kind==='invalid-response').length,0);
const blendCode=Object.keys(blend.scan.entries).find(key=>blend.scan.entries[key].kind==='code');
const observedHash=Buffer.from(xdr.LedgerKey.fromXDR(blendCode,'base64').contractCode.hash.value).toString('hex');
assert.equal(observedHash,registry.hashes.lendingPoolV2,'live code differs from published Testnet registry');
assert.equal(blend.optimization.findings.filter(f=>f.code==='durability-review').length,2);
assert.equal(blend.optimization.findings.filter(f=>f.code==='shared-code-dependency').length,1);
assert(blend.optimization.findings.filter(f=>f.code==='durability-review').every(f=>f.action.includes('Only if')&&f.action.includes('required configuration')));
assert.equal(blend.scan.coverage.noDataKeysDeclaredByContract?.[pool],undefined);

phase='bc-post';
const after=await reader.read(Object.keys(bc.scan.entries));
assert.equal(after.entries.length,Object.keys(bc.scan.entries).length);
for(const row of after.entries)assert.equal(row.liveUntilLedgerSeq,bc.scan.entries[row.key].ttl.endsAtLedger,'B/C TTL changed during read-only validation');
writeFileSync(`${base}/bc-post/parsed.json`,JSON.stringify(after,null,2));
const verification={capturedAt:new Date().toISOString(),runtimeBase:'38e6543',network:'testnet',rpcMethods:[...new Set(calls.map(c=>c.method))],bc:{inputContracts:3,uniqueContracts:2,returnedEntries:Object.keys(bc.scan.entries).length,uniqueRequestedKeys:bcRequested.length,sharedCodeFindings:1,persistentFindings:2,temporaryFindings:0,issues:bc.scan.issues.map(i=>i.kind),exitCode:bc.exitCode,ttlUnchangedAcrossReads:true},blend:{contract:pool,asset:registry.ids.USDC,registryCommit:'b05242df30b6b6caf9d317646f754541824a5a8b',storageSourceCommit:'ba22b487b2c5057a4ecc28b05b5193c28e4bd117',wasmHash:observedHash,matchesPublishedHash:true,returnedEntries:4,persistentKeys:['ResConfig(USDC)','ResData(USDC)'],adviceCount:blend.optimization.findings.length,exitCode:blend.exitCode,fullStorageEnumeration:false},aEvidenceReused:'docs/evidence/2026-09-10-storage-advice/',calls};
writeFileSync(`${base}/verification.json`,JSON.stringify(verification,null,2));
process.stdout.write(JSON.stringify(verification,null,2)+'\n');

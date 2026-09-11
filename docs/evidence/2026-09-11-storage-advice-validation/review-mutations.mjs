import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {URL} from 'node:url';
import assert from 'node:assert/strict';
import process from 'node:process';
const source=new URL('.',import.meta.url).pathname;
const positive=spawnSync('node',[`${source}/verify.mjs`],{encoding:'utf8'});
assert.equal(positive.status,0,positive.stderr);
const results=[];
for(const name of ['empty-post','duplicate-post','wrong-registry','wrong-settings']){
  const folder=mkdtempSync(new URL('../d1202-review-',import.meta.url).pathname);
  try{
    cpSync(source,folder,{recursive:true});
    function edit(path,change){const data=JSON.parse(readFileSync(`${folder}/${path}`,'utf8'));change(data);writeFileSync(`${folder}/${path}`,JSON.stringify(data,null,2));}
    let expected;
    if(name==='empty-post'||name==='duplicate-post'){
      edit('bc-post/07-getLedgerEntries-response.json',data=>{
        if(name==='empty-post')data.result.entries=[];
        else data.result.entries[1]=data.result.entries[0];
      });
      expected='Post-read must cover every original entry exactly once';
    }else if(name==='wrong-registry'){
      edit('provenance/blend-testnet.contracts.json',data=>{data.hashes.lendingPoolV2='f'.repeat(64);});
      // Update the digest too: the semantic check, not only integrity, must fail.
      const digest=createHash('sha256').update(readFileSync(`${folder}/provenance/blend-testnet.contracts.json`)).digest('hex');
      edit('provenance.json',data=>{data.registry.sha256=digest;});
      expected='Observed Wasm must match publisher registry';
    }else{
      edit('input.json',data=>{data.settings.minTemporaryTtl+=1;});
      expected='Settings must match raw RPC';
    }
    const result=spawnSync('node',[`${folder}/verify.mjs`],{encoding:'utf8'});
    assert.notEqual(result.status,0,`${name} wrongly passed`);
    assert(result.stderr.includes(expected),`${name} failed for the wrong reason: ${result.stderr}`);
    results.push({mutation:name,rejected:true,reason:expected});
  }finally{rmSync(folder,{recursive:true,force:true});}
}
const output={positiveControlPassed:true,originalEvidenceUnchanged:true,results};
writeFileSync(`${source}/review-mutation-results.json`,JSON.stringify(output,null,2)+'\n');
process.stdout.write(JSON.stringify(output,null,2)+'\n');

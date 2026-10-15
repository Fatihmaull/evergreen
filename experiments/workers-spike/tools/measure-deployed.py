#!/usr/bin/env python3
"""DEPLOYED leg: hits the disposable workers.dev Workers sequentially, records per-request rows (no credentials, no client IP),
compares scan/extend output with the real CLI (ledger drift masked: only observedAtLedger/remainingLedgers).
Usage: measure-deployed.py <variant nobuf|buf> <N>"""
import json, subprocess, sys, time, os, urllib.request, urllib.error, statistics
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
variant=sys.argv[1]; N=int(sys.argv[2])
BASE=f'https://evergreen-spike-tmp-1015-{variant}.evergreen-cer.workers.dev'
A='CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'
B='CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';C='CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL'
G='GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB'
def cli(args):
    p=subprocess.run(['node',f'{ROOT}/packages/cli/dist/bin.js',*args],capture_output=True,text=True)
    return p.stdout
MASK=('observedAtLedger','remainingLedgers')
# extend dry-run output ALSO embeds values derived from the live ledger/clock: tx timebounds (-> XDR, hash), target ledger, recordedAt.
# For extend only the mask is widened; the byte-exact extend comparison is the replay one (compare-replay-deployed.sh).
MASK_EXTEND=MASK+('extendToLedgers','recordedAt','simulatedAtLedger','transactionXdr','transactionHash','feeStroops','estimatedFeeStroops')
def mask(o,keys=MASK):
    if isinstance(o,dict): return {k:mask(v,keys) for k,v in o.items() if k not in keys}
    if isinstance(o,list): return [mask(x,keys) for x in o]
    return o
def get(path):
    t=time.perf_counter()
    try:
        r=urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'User-Agent':'curl/8.15.0'}),timeout=60); st=r.status; h=r.headers; body=r.read().decode()
    except urllib.error.HTTPError as e:
        st=e.code; h=e.headers; body=e.read().decode()
    ms=(time.perf_counter()-t)*1000
    return dict(status=st,client_ms=round(ms,1),subreq=h.get('x-subrequests'),worker_wall_ms=h.get('x-wall-ms'),colo=h.get('x-colo'),ray=h.get('cf-ray'),exit=h.get('x-exit-code'),err=h.get('x-error'),body=body)
routes={
 'scanA-json':f'/scan?contract={A}&format=json',
 'scanABC-json':f'/scan?contract={A},{B},{C}&format=json',
 'scanA-human':f'/scan?contract={A}&format=human',
 'extendA-dryrun':f'/extend-dryrun?contract={A}&source={G}&ledgers=1000',
 'neon-http-q1':'/neon?transport=http&q=1',
 'neon-http-q2':'/neon?transport=http&q=2',
 'neon-ws-q1':'/neon?transport=ws&q=1',
 'neon-ws-q2':'/neon?transport=ws&q=2',
 'neon-ws-q5':'/neon?transport=ws&q=5',
}
only=sys.argv[3].split(',') if len(sys.argv)>3 else list(routes)
out=open(f'results/deployed/requests-{variant}.jsonl','a')
summary={}
for name in only:
    rows=[]
    for i in range(N):
        r=get(routes[name]); r['i']=i
        rows.append(r)
        slim={k:v for k,v in r.items() if k!='body'}
        slim.update(route=name,variant=variant,ts=time.time())
        if name.startswith('neon') and r['status']==200:
            try:
                j=json.loads(r['body']); slim['neon']={k:j.get(k) for k in('ok','transport','queries','connectMs','queryMs','totalMs','subrequests','fetchStatuses','select1','version')}
            except Exception as e: slim['neon_parse_error']=str(e)
        elif name.startswith('neon'): slim['body_head']=r['body'][:300]
        elif r['status']!=200: slim['body_head']=r['body'][:300]
        out.write(json.dumps(slim)+'\n'); out.flush()
        time.sleep(0.2)
    ms=sorted(r['client_ms'] for r in rows)
    s=dict(n=N,status=sorted({r['status'] for r in rows}),subreq=sorted({r['subreq'] for r in rows}),colo=sorted({r['colo'] for r in rows if r['colo']}),
      client_p50=ms[N//2],client_p90=ms[int(N*0.9)],client_max=ms[-1],worker_wall_p50=statistics.median(float(r['worker_wall_ms'] or 0) for r in rows),
      errors=sorted({(r['err'] or r['body'][:120]) for r in rows if r['status']!=200}))
    # compare with CLI
    if name.startswith('scan') and name.endswith('json') or name.startswith('extend'):
        ids={'scanA-json':['scan',A,'--json'],'scanABC-json':['scan',A,B,C,'--json'],'extendA-dryrun':['extend',A,'--ledgers','1000','--source-account',G,'--json']}[name]
        c1=json.loads(cli(ids)); 
        ok=0; raw=0; bad=[]; k=MASK_EXTEND if name.startswith('extend') else MASK
        for r in rows:
            if r['status']!=200: bad.append(r['status']); continue
            w=json.loads(r['body'])
            k=MASK_EXTEND if name.startswith('extend') else MASK; ok+= mask(w,k)==mask(c1,k); raw+= w==c1
        c2=json.loads(cli(ids))
        s['cli_masked_identical']=f'{ok}/{N} vs cli-before (cli-before==cli-after masked: {mask(c1,k)==mask(c2,k)})'; s['raw_identical']=raw
        open(f'results/deployed/cli-{variant}-{name}.json','w').write(json.dumps(c1,indent=1))
        open(f'results/deployed/worker-{variant}-{name}.json','w').write(rows[-1]['body'])
    if name=='scanA-human':
        c=cli(['scan',A]); s['cli_human_identical']=sum(r['body']==c for r in rows)
    summary[name]=s
    print(name,json.dumps(s),flush=True)
json.dump(summary,open(f'results/deployed/summary-{variant}.json','w'),indent=1)

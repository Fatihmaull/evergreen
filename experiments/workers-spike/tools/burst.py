#!/usr/bin/env python3
"""Sustained-load probe on a DEPLOYED disposable Worker: does the free-plan 10 ms CPU limit start terminating requests (error 1102 / exceededCpu)
once traffic is not a trickle? usage: burst.py <variant> <route-name> <N> <concurrency>  (read-only testnet scans / dry-run only)"""
import sys,json,time,concurrent.futures as cf,urllib.request,urllib.error,collections
variant,name,N,CONC=sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4])
A='CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';G='GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB'
path={'scanA-json':f'/scan?contract={A}&format=json','extendA-dryrun':f'/extend-dryrun?contract={A}&source={G}&ledgers=1000'}[name]
BASE=f'https://evergreen-spike-tmp-1015-{variant}.evergreen-cer.workers.dev'
def one(i):
    t=time.perf_counter()
    try:
        r=urllib.request.urlopen(urllib.request.Request(BASE+path,headers={'User-Agent':'curl/8.15.0'}),timeout=90); st=r.status;h=r.headers;b=r.read().decode()
    except urllib.error.HTTPError as e: st=e.code;h=e.headers;b=e.read().decode()
    except Exception as e: return dict(i=i,status='client-error',err=str(e)[:100])
    return dict(i=i,status=st,client_ms=round((time.perf_counter()-t)*1000),subreq=h.get('x-subrequests'),colo=h.get('x-colo'),ray=h.get('cf-ray'),err=h.get('x-error'),exit=h.get('x-exit-code'),body_head=b[:200] if st!=200 else None,json_ok=(st==200 and b.lstrip().startswith('{')))
t0=time.time()
with cf.ThreadPoolExecutor(CONC) as ex: rows=list(ex.map(one,range(N)))
dur=time.time()-t0
out=open(f'results/deployed/requests-{variant}.jsonl','a')
for r in rows: r.update(route='burst-'+name,variant=variant); out.write(json.dumps(r)+'\n')
c=collections.Counter(str(r['status']) for r in rows)
print(variant,name,'N',N,'conc',CONC,'secs',round(dur,1),'status',dict(c),'rps',round(N/dur,1))
for r in rows:
    if r['status']!=200: print('  non-200',r.get('status'),(r.get('body_head') or r.get('err') or '')[:150].replace('\n',' ')); break

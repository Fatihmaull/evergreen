#!/usr/bin/env python3
"""Join `wrangler tail --format json` events (cpuTime/wallTime/outcome) with the per-request rows by cf-ray.
The raw tail output contains the client IP, so it is NOT committed; only the slim extract (no IP, no headers) is."""
import json,sys,collections,statistics,os
R='results/deployed'
def load(path):
    dec=json.JSONDecoder(); s=open(path).read(); i=0; out=[]
    while True:
        while i<len(s) and s[i].isspace(): i+=1
        if i>=len(s): break
        o,i=dec.raw_decode(s,i); out.append(o)
    return out
slim=[]; byray={}
for v in ('buf','nobuf'):
    evs=[]
    for d in os.environ.get('TAILDIRS','/tmp/spike-tail:/tmp/spike-tail2').split(':'):
        if os.path.exists(f'{d}/tail-{v}.jsonl'): evs+=load(f'{d}/tail-{v}.jsonl')
    for e in evs:
        rq=e['event']['request']; ray=rq['headers'].get('cf-ray')
        d=dict(variant=v,ray=ray,path=rq['url'].split('workers.dev')[1].split('?')[0],query=rq['url'].split('?')[1][:60] if '?' in rq['url'] else '',
          cpuTime=e.get('cpuTime'),wallTime=e.get('wallTime'),outcome=e['outcome'],nexc=len(e['exceptions']),exceptions=[str(x)[:200] for x in e['exceptions']],
          status=e['event'].get('response',{}).get('status'),colo=rq.get('cf',{}).get('colo'),executionModel=e.get('executionModel'),ts=e['eventTimestamp'])
        slim.append(d); byray[(v,ray)]=d
json.dump(slim,open(f'{R}/tail-slim.json','w'))
print('tail events',len(slim),'outcomes',dict(collections.Counter(d['outcome'] for d in slim)),'exceptions',sum(d['nexc'] for d in slim))
rows=collections.defaultdict(list); miss=0
for v in ('buf','nobuf'):
    for l in open(f'{R}/requests-{v}.jsonl'):
        r=json.loads(l); t=byray.get((v,(r['ray'] or '').split('-')[0]))
        if not t: miss+=1; continue
        rows[(v,r['route'])].append((t,r))
print('requests without tail match (tail drops events under burst load)',miss)
def pct(a,p): a=sorted(a); return a[min(len(a)-1,int(p*len(a)))]
res={}
print(f'{"variant":7} {"route":16} {"n":>3} cpu_ms(p50/p90/max) cpu_dist  wallTime(p50/max) outcomes')
for (v,route),lst in sorted(rows.items()):
    cpu=[t['cpuTime'] for t,_ in lst]; wall=[t['wallTime'] for t,_ in lst]
    c=collections.Counter(cpu)
    res[f'{v}/{route}']=dict(n=len(lst),cpu_p50=pct(cpu,.5),cpu_p90=pct(cpu,.9),cpu_max=max(cpu),cpu_mean=round(statistics.mean(cpu),2),cpu_dist=dict(sorted(c.items())),wall_p50=pct(wall,.5),wall_max=max(wall),outcomes=dict(collections.Counter(t['outcome'] for t,_ in lst)),colos=dict(collections.Counter(t['colo'] for t,_ in lst)))
    print(f'{v:7} {route:16} {len(lst):>3} {pct(cpu,.5)}/{pct(cpu,.9)}/{max(cpu)} mean={statistics.mean(cpu):.2f} {dict(sorted(c.items()))} wall {pct(wall,.5)}/{max(wall)} {dict(collections.Counter(t["outcome"] for t,_ in lst))}')
json.dump(res,open(f'{R}/cpu-by-route.json','w'),indent=1)

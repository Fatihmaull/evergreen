#!/usr/bin/env python3
"""Read-only Workers GraphQL analytics (workersInvocationsAdaptive), grouped by Worker and status. Output -> results/deployed/graphql-analytics.json"""
import sys,json,importlib.util
spec=importlib.util.spec_from_file_location('cf',__file__.replace('graphql-analytics.py','cf-get.py')); cf=importlib.util.module_from_spec(spec); spec.loader.exec_module(cf)
q='''query($acc:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$acc}){
 workersInvocationsAdaptive(limit:200,filter:{datetime_geq:$s,datetime_leq:$e},orderBy:[scriptName_ASC,status_ASC]){
  dimensions{scriptName status} sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP90 cpuTimeP99 cpuTimeP999 wallTimeP50 wallTimeP99}}}}}'''
st,j=cf.call('/graphql',{'query':q,'variables':{'acc':cf.ACC,'s':sys.argv[1],'e':sys.argv[2]}})
print(st)
if j.get('errors'): print(json.dumps(j['errors'])[:500])
rows=(((j.get('data') or {}).get('viewer') or {}).get('accounts') or [{}])[0].get('workersInvocationsAdaptive',[])
json.dump(rows,open('results/deployed/graphql-analytics.json','w'),indent=1)
for r in rows: print(r['dimensions'],r['sum'],{k:round(v,1) for k,v in r['quantiles'].items()})

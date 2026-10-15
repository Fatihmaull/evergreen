#!/usr/bin/env python3
"""LIVE scan-vs-CLI comparison (RPC cannot be pinned to a ledger: getLedgerEntries always answers at the latest one).
Runs CLI, Worker, CLI back-to-back; reports each side's observedAtLedger; raw diff; and a diff after masking ONLY the
two ledger-dependent fields (observedAtLedger, remainingLedgers). remainingLedgers is checked to equal endsAtLedger-observedAtLedger."""
import json, subprocess, sys, urllib.request, os
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),'../../..'))
A='CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'
def cli(ids):
    p=subprocess.run(['node',f'{ROOT}/packages/cli/dist/bin.js','scan',*ids,'--json'],capture_output=True,text=True)
    return json.loads(p.stdout)
def worker(port,ids):
    return json.loads(urllib.request.urlopen(f'http://localhost:{port}/scan?contract={",".join(ids)}&format=json').read())
def ledgers(d): return sorted({e['observedAtLedger'] for e in d['entries'].values()})
def mask(o):
    if isinstance(o,dict): return {k:mask(v) for k,v in o.items() if k not in('observedAtLedger','remainingLedgers')}
    if isinstance(o,list): return [mask(x) for x in o]
    return o
def consistent(d):
    return all(e['ttl']['remainingLedgers']==e['ttl']['endsAtLedger']-e['observedAtLedger'] for e in d['entries'].values() if e['ttl']['status']=='known')
B='CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';C='CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL'
for label,ids in (('A',[A]),('A+B+C',[A,B,C])):
    c1=cli(ids)
    for port,name in ((8788,'worker-nobuffer'),(8787,'worker-buffer')):
        w=worker(port,ids)
        c2=cli(ids)
        print(f'[{label}] {name}: cli before ledger {ledgers(c1)}, worker ledger {ledgers(w)}, cli after ledger {ledgers(c2)}')
        print(f'   raw identical: {w==c1 or w==c2}; masked identical (vs cli-before): {mask(w)==mask(c1)}; vs cli-after: {mask(w)==mask(c2)}; remaining==ends-observed: {consistent(w)}')
        c1=c2

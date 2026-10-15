#!/usr/bin/env bash
# Pinned scan-vs-CLI comparison. Both sides answer from the SAME recorded RPC bytes and the same frozen clock,
# so any difference is runtime behaviour, not ledger drift.
# Needs: `wrangler dev` on :8788 (compat date 2024-01-01, no global Buffer) and :8787 (compat date 2026-10-01).
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); S=$ROOT/experiments/workers-spike; R=$S/results
A=CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
G=GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB   # public key of the documented 'Rakha dev' account (docs/SETUP.md)
NOW=2026-10-15T12:01:37.192Z   # the wall-clock instant of the recording; the extend tx timebounds derive from it
pre() { EG_MODE=replay EG_FILE=$S/src/recording.json EG_NOW=$NOW node --import $S/tools/fetch-preload.mjs "$@"; }
mkdir -p $R
pre $ROOT/packages/cli/dist/bin.js scan $A --json  > $R/cli.scan.json.out
pre $ROOT/packages/cli/dist/bin.js scan $A          > $R/cli.scan.human.out
pre $ROOT/packages/cli/dist/bin.js extend $A --ledgers 1000 --source-account $G --json > $R/cli.extend.json.out 2>/dev/null
B=CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ; C=CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL   # read-only scan of B and C (never written)
pre $ROOT/packages/cli/dist/bin.js scan $A $B $C --json > $R/cli.scanABC.json.out
pre $ROOT/packages/cli/dist/bin.js scan $A $B $C       > $R/cli.scanABC.human.out
for v in 8788:nobuffer 8787:buffer; do
  port=${v%%:*}; name=${v##*:}
  curl -s "localhost:$port/scan?contract=$A&format=json&replay=1&now=$NOW"  > $R/worker-$name.scan.json.out
  curl -s "localhost:$port/scan?contract=$A&format=human&replay=1&now=$NOW" > $R/worker-$name.scan.human.out
  curl -s "localhost:$port/extend-dryrun?contract=$A&source=$G&ledgers=1000&replay=1&now=$NOW" > $R/worker-$name.extend.json.out
  curl -s "localhost:$port/scan?contract=$A,$B,$C&format=json&replay=1&now=$NOW"  > $R/worker-$name.scanABC.json.out
  curl -s "localhost:$port/scan?contract=$A,$B,$C&format=human&replay=1&now=$NOW" > $R/worker-$name.scanABC.human.out
  for k in scanABC.json scanABC.human scan.json scan.human extend.json; do
    if diff <(cat $R/cli.$k.out) <(cat $R/worker-$name.$k.out; echo) > $R/diff-$name.$k.txt; then echo "$name $k: IDENTICAL (sha256 $(sha256sum < $R/cli.$k.out | cut -c1-16))"; else echo "$name $k: DIFFERS (see results/diff-$name.$k.txt)"; fi
  done
done

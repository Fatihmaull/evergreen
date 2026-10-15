#!/usr/bin/env bash
# Pinned scan/extend-vs-CLI comparison against the DEPLOYED workers.dev Workers (see compare-replay.sh for the local one).
# CLI side = replay of src/recording.json with frozen clock. Worker side = ?replay=1&now=... (answers from the bundled copy of the same recording).
set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd); S=$ROOT/experiments/workers-spike; R=$S/results/deployed/replay; mkdir -p $R
A=CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
G=GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB
B=CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ; C=CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL
NOW=2026-10-15T12:01:37.192Z
pre() { EG_MODE=replay EG_FILE=$S/src/recording.json EG_NOW=$NOW node --import $S/tools/fetch-preload.mjs "$@"; }
pre $ROOT/packages/cli/dist/bin.js scan $A --json  > $R/cli.scan.json.out
pre $ROOT/packages/cli/dist/bin.js scan $A          > $R/cli.scan.human.out
pre $ROOT/packages/cli/dist/bin.js extend $A --ledgers 1000 --source-account $G --json > $R/cli.extend.json.out 2>/dev/null
pre $ROOT/packages/cli/dist/bin.js scan $A $B $C --json > $R/cli.scanABC.json.out
pre $ROOT/packages/cli/dist/bin.js scan $A $B $C       > $R/cli.scanABC.human.out
for name in nobuf buf; do
  U=https://evergreen-spike-tmp-1015-$name.evergreen-cer.workers.dev; UA='User-Agent: curl/8.15.0'
  curl -s -H "$UA" "$U/scan?contract=$A&format=json&replay=1&now=$NOW"  > $R/worker-$name.scan.json.out
  curl -s -H "$UA" "$U/scan?contract=$A&format=human&replay=1&now=$NOW" > $R/worker-$name.scan.human.out
  curl -s -H "$UA" "$U/extend-dryrun?contract=$A&source=$G&ledgers=1000&replay=1&now=$NOW" > $R/worker-$name.extend.json.out
  curl -s -H "$UA" "$U/scan?contract=$A,$B,$C&format=json&replay=1&now=$NOW"  > $R/worker-$name.scanABC.json.out
  curl -s -H "$UA" "$U/scan?contract=$A,$B,$C&format=human&replay=1&now=$NOW" > $R/worker-$name.scanABC.human.out
  for k in scanABC.json scanABC.human scan.json scan.human extend.json; do
    if diff <(cat $R/cli.$k.out) <(cat $R/worker-$name.$k.out; echo) > $R/diff-$name.$k.txt; then echo "deployed $name $k: IDENTICAL (sha256 $(sha256sum < $R/cli.$k.out | cut -c1-16))"; else echo "deployed $name $k: DIFFERS (see results/deployed/replay/diff-$name.$k.txt)"; fi
  done
done

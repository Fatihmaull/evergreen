#!/usr/bin/env python3
"""Re-derive the projected threshold crossing for the decay-proof contracts.

Why this exists
---------------
Guinea-pigs B and C were calibrated once, on 2026-09-05, against a measured
ledger close rate of 5.000 s/ledger. That calibration has to hold for ~280,000
and ~367,000 ledgers respectively — roughly 16 and 21 days.

Testnet close times are less regular than mainnet's. A 0.5% deviation over
280,747 ledgers is ~1,400 ledgers, about two hours of drift, and a validator
hiccup or a load period does not have to be dramatic to move the crossing by
hours. **Drift can run early, which is the dangerous direction**: the engine
being live "by the projected date" is not good enough if the crossing arrives
six hours before it.

So: do not set and forget. Run this twice a week, paste the output into
`docs/STATUS.md`, and react while there is still room to react.

    python3 scripts/check-decay-drift.py

This is a temporary stand-in. Once `evergreen scan` exists (W1-D7 onward) it
does this properly and this script should be deleted rather than maintained.
"""

import datetime
import json
import subprocess
import sys
import urllib.request

RPC = "https://soroban-testnet.stellar.org"
WASM_HASH = "c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb"
THRESHOLD_LEDGERS = 17_280  # 24h, matches evergreen.config.example.json
SECONDS_PER_LEDGER = 5.0  # measured 2026-09-05 over a 100,000-ledger sample

# docs/SETUP.md is the source of truth for these ids.
CONTRACTS = {
    "B (primary proof)": (
        "CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ",
        datetime.datetime(2026, 9, 20, 12, 0),
    ),
    "C (staggered spare)": (
        "CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL",
        datetime.datetime(2026, 9, 25, 12, 0),
    ),
}


def encode_key(obj: dict) -> str:
    r = subprocess.run(
        ["stellar", "xdr", "encode", "--type", "LedgerKey", "--input", "json"],
        input=json.dumps(obj), capture_output=True, text=True,
    )
    if r.returncode != 0:
        sys.exit(f"stellar xdr encode failed: {r.stderr.strip()}")
    return r.stdout.strip()


def get_entries(keys: list[str]) -> dict:
    body = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "getLedgerEntries", "params": {"keys": keys}}
    ).encode()
    req = urllib.request.Request(
        RPC, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "evergreen-drift-check/0.1"},
    )
    return json.load(urllib.request.urlopen(req, timeout=30))["result"]


def main() -> int:
    now = datetime.datetime.now(datetime.UTC)
    print(f"decay-proof drift check — {now.strftime('%Y-%m-%d %H:%M')} UTC\n")
    worst = None

    for label, (cid, expected) in CONTRACTS.items():
        keys = {
            "instance": encode_key({"contract_data": {
                "contract": cid, "key": "ledger_key_contract_instance", "durability": "persistent"}}),
            "persistent": encode_key({"contract_data": {
                "contract": cid, "key": {"vec": [{"symbol": "Persistent"}]}, "durability": "persistent"}}),
        }
        res = get_entries(list(keys.values()))
        current = res["latestLedger"]
        found = {e["key"]: e for e in res.get("entries", [])}

        print(f"{label}  {cid[:12]}…   current ledger {current:,}")
        for name, k in keys.items():
            entry = found.get(k)
            if entry is None:
                print(f"   {name:<11} ⚠️  ABSENT — archived or never written")
                continue
            live_until = entry["liveUntilLedgerSeq"]
            crossing_ledger = live_until - THRESHOLD_LEDGERS
            seconds_away = (crossing_ledger - current) * SECONDS_PER_LEDGER
            projected = now + datetime.timedelta(seconds=seconds_away)
            drift_h = (projected.replace(tzinfo=None) - expected).total_seconds() / 3600
            flag = "  ← EARLY" if drift_h < -2 else ""
            print(
                f"   {name:<11} crosses ~{projected.strftime('%Y-%m-%d %H:%M')} UTC"
                f"   drift {drift_h:+.1f}h vs plan{flag}"
            )
            worst = drift_h if worst is None or drift_h < worst else worst
        print()

    if worst is not None and worst < -6:
        print("⚠️  A crossing has drifted more than 6h EARLY. The engine must be live sooner")
        print("    than planned. Update docs/STATUS.md and tell the team today.")
        return 1
    print("Paste this into docs/STATUS.md under the decay-proof section.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

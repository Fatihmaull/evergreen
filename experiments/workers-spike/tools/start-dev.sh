#!/usr/bin/env bash
# Two local workerd instances, separate state dirs (a shared dir deadlocks on reload: SQLITE_BUSY).
#   :8788  compatibility_date 2024-01-01  -> global Buffer / process ABSENT (the "plain Workers" runtime)
#   :8787  compatibility_date 2026-10-01  -> global Buffer / process PRESENT (observed; see report)
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false CI=1
nohup npx wrangler dev --port 8788 --ip localhost --inspector-port 9231 --compatibility-date 2024-01-01 --persist-to /tmp/spike/persist-old > /tmp/spike/wrangler-old.log 2>&1 &
nohup npx wrangler dev --port 8787 --ip localhost --inspector-port 9230 --persist-to /tmp/spike/persist-new > /tmp/spike/wrangler-new.log 2>&1 &

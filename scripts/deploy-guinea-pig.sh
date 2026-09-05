#!/usr/bin/env bash
#
# Deploy a guinea-pig contract to Stellar testnet. [W1-D4-00]
#
# Two contracts get deployed from the same code, with different jobs:
#
#   A  the working test subject — bump it, break it, redeploy it freely.
#      Used for everyday development and the threshold proof (W3-D18-02a).
#
#   B  the natural-decay subject — deployed early and left ALONE to age, so its
#      TTL decays on its own and the engine can save it unattended at
#      W3-D18-02b. That is the strongest single piece of evidence in the grant.
#
#      ############################################################
#      #  B MUST NEVER ENTER THE ENGINE'S WATCHED-CONTRACT LIST   #
#      #  BEFORE THE MOMENT OF PROOF.                             #
#      #                                                          #
#      #  If the engine sees B, it will dutifully bump it — and   #
#      #  destroy the weeks of ageing it was deployed to produce. #
#      #  There is no way to get that time back inside the sprint.#
#      #  See evergreen.config.example.json and docs/SETUP.md.    #
#      ############################################################
#
# Also the recovery path after a testnet reset: testnet is wiped periodically,
# taking our contracts and accounts with it. If everything 404s, suspect a reset
# before suspecting the code. A reset DESTROYS B's accumulated age — redeploy
# immediately and record the lost time in docs/STATUS.md, because the
# natural-decay proof may no longer fit the sprint.
#
# TESTNET ONLY. This script refuses to run against any other network.
#
# Usage:
#   ./scripts/deploy-guinea-pig.sh A
#   ./scripts/deploy-guinea-pig.sh B
#
# Env:
#   EVERGREEN_DEPLOY_SOURCE   stellar CLI identity to deploy with (default: default)

set -euo pipefail

readonly NETWORK="testnet"
readonly SOURCE="${EVERGREEN_DEPLOY_SOURCE:-default}"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly WASM="${REPO_ROOT}/target/wasm32v1-none/release/guinea_pig.wasm"

die() { printf '\nerror: %s\n' "$*" >&2; exit 1; }

# --- Which guinea-pig? --------------------------------------------------------
WHICH="${1:-}"
case "${WHICH}" in
  A|a) WHICH="A"; ROLE="working test subject (threshold proof, W3-D18-02a)" ;;
  B|b) WHICH="B"; ROLE="NATURAL-DECAY subject (W3-D18-02b) — keep out of the engine config" ;;
  *)   die "usage: $0 <A|B>   (A = working subject, B = natural-decay subject)" ;;
esac

# --- Refuse anything but testnet ---------------------------------------------
# CLAUDE.md hard rule 1: testnet only. Not a flag, not an override.
passphrase="$(stellar network info "${NETWORK}" 2>/dev/null | grep -i 'passphrase' || true)"
case "${passphrase}" in
  *"Test SDF Network"*) : ;;
  *) die "network '${NETWORK}' is not Stellar testnet (passphrase: ${passphrase:-unknown}).
       This script deploys to testnet only. Refusing to continue." ;;
esac

# --- Build --------------------------------------------------------------------
[ -f "${WASM}" ] || {
  printf 'wasm not found, building...\n'
  (cd "${REPO_ROOT}" && stellar contract build >/dev/null)
}
[ -f "${WASM}" ] || die "build did not produce ${WASM}"

printf '\nDeploying guinea-pig %s — %s\n' "${WHICH}" "${ROLE}"
printf 'network: %s   source: %s\n\n' "${NETWORK}" "${SOURCE}"

# --- Deploy -------------------------------------------------------------------
CONTRACT_ID="$(stellar contract deploy \
  --wasm "${WASM}" \
  --source "${SOURCE}" \
  --network "${NETWORK}")" || die "deploy failed"

printf '\ncontract id: %s\n' "${CONTRACT_ID}"

# --- Seed, so all four entry types exist -------------------------------------
# Deploying gives instance + code entries. Seeding adds persistent + temporary,
# so W1-D4-04b can measure the real TTL floor for every type on one contract.
printf 'seeding (writes persistent + temporary + instance entries)...\n'
stellar contract invoke \
  --id "${CONTRACT_ID}" \
  --source "${SOURCE}" \
  --network "${NETWORK}" \
  -- seed --value 1 >/dev/null || die "seed failed — the contract deployed but has no entries yet"

printf '\n✅ guinea-pig %s deployed and seeded\n\n' "${WHICH}"
printf 'Next:\n'
printf '  1. Record the contract ID in docs/SETUP.md under guinea-pig %s.\n' "${WHICH}"
printf '  2. Note the deploy date — B'"'"'s age is the whole point of B.\n'
if [ "${WHICH}" = "B" ]; then
  printf '\n  ⚠️  This is guinea-pig B. Do NOT add %s\n' "${CONTRACT_ID}"
  printf '      to evergreen.config.json until the moment of proof (W3-D18-02b).\n'
  printf '      If the engine sees it, it will bump it and destroy the evidence.\n\n'
fi

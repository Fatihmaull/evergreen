#!/usr/bin/env bash
# Redeploy a guinea-pig contract after a testnet reset.
#
# Stellar testnet is reset periodically. When it happens, our contracts and
# accounts vanish and everything 404s. Suspect a reset before suspecting the
# code (docs/SETUP.md).
#
# TESTNET ONLY. This script must never be pointed at mainnet.
#
# Written at W1-D4-04. Until then this is a placeholder that fails loudly rather
# than pretending to work.

set -euo pipefail

echo "deploy-guinea-pig.sh is not implemented yet (W1-D4-04)."
echo
echo "When it is, it must:"
echo "  1. Refuse to run against any network passphrase but testnet."
echo "  2. Deploy the contract and print the new contract ID."
echo "  3. Remind the operator to update docs/SETUP.md and note it in STATUS.md."
echo
echo "Two guinea-pigs, with different jobs — see docs/SETUP.md:"
echo "  A  the working test subject; bump it, break it, redeploy it freely."
echo "  B  the natural-decay subject for W3-D18-02b. Deployed early and left to"
echo "     age. A reset DESTROYS its accumulated age: redeploy immediately and"
echo "     record the lost time in STATUS, because the natural-decay proof may"
echo "     no longer fit the sprint."
echo
echo "  B must stay OUT of the engine's watched-contract config until the moment"
echo "  of proof. If the engine sees it, it will bump it and destroy the"
echo "  evidence it was deployed to produce."
exit 1

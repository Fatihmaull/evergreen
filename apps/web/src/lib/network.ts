/**
 * Which network this build of the site reads, resolved once at build time.
 *
 * The site is static on Cloudflare Pages: there is no server to ask and no
 * request to vary on, so the network is a property of the artefact. It comes
 * from core's table (`PH2-E1-03`) rather than from a literal per call site —
 * `RPC_URL` was a string in `lib/evergreen.ts` and another in
 * `chrome-client.ts`, and `Networks.TESTNET` was a third answer to the same
 * question in a third place.
 *
 * `__EVERGREEN_NETWORK__` and `__SOROBAN_RPC_URL__` are esbuild `define`s that
 * `build.mjs` always sets — to the literal `undefined` when the environment
 * does not, so this resolves to testnet and the default build is exactly
 * today's site. They are declared rather than imported because they do not
 * exist as bindings: esbuild substitutes them, and `tsc` has to be told.
 *
 * A NON-TESTNET BUILD IS REFUSED BY `build.mjs`, not by this module. The
 * difference matters: `resolveNetwork` refuses a mainnet build that is
 * MISCONFIGURED, and a correctly configured one would sail through and publish
 * a dashboard reading mainnet with "Testnet only" still in the footer of every
 * page. That is one environment variable away, so the refusal belongs where the
 * artefact is produced. The plumbing is here so the day the rule lifts
 * (`PH2-E5-02`, `PH2-E5-04`) the work is a build flag and the copy, not a
 * rewrite of every call site.
 */
import { resolveNetwork } from '../../../../packages/core/src/index';
import type { NetworkChoice } from '../../../../packages/core/src/index';

declare const __EVERGREEN_NETWORK__: string | undefined;
declare const __SOROBAN_RPC_URL__: string | undefined;

/**
 * `typeof` first, because a bare reference is a ReferenceError.
 *
 * esbuild substitutes these identifiers when it bundles, so in the browser
 * they are string literals. Nothing substitutes them when vitest imports this
 * module, and reading an undeclared binding throws — which took down every
 * test that imports `evergreen.ts`, not just the ones about the network.
 * `typeof` on an undeclared identifier is legal and answers `'undefined'`, and
 * esbuild folds it through the define, so one expression is correct in both
 * worlds. An absent define means unset, which `resolveNetwork` reads as
 * testnet.
 */
const network = typeof __EVERGREEN_NETWORK__ === 'undefined' ? undefined : __EVERGREEN_NETWORK__;
const rpcUrl = typeof __SOROBAN_RPC_URL__ === 'undefined' ? undefined : __SOROBAN_RPC_URL__;

export const NETWORK: NetworkChoice = resolveNetwork({ env: network, rpcUrl });

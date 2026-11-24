/**
 * Turning autopilot on: `PATCH /watchlist/{network}/{contractId}` with
 * `autopilot.enabled` set (`docs/API.md` §6). Step D of /allowance/
 * (components.md § "B, C, D").
 *
 * The only caller is `pages/allowance.ts`, and only after the chain reads back
 * exactly the allowance that was signed, or reads a live allowance at least
 * the cap. Both need `ENGINE_SPENDER`, which only a testnet build has. It is
 * its own module so that the guard
 * in `test/docs-account-page.test.ts` can name the one place that sends it.
 *
 * Each contract is its own request. The API checks the payer is linked, the
 * threshold is at or above the engine's floor, Extend to is above Act below,
 * and the budget's order; this sends what the person saw and changes nothing.
 */
import { apiRequest, type FetchLike, type Me } from './api';
import type { AutopilotOnOutcome } from './allowance-review';

export interface AutopilotSettings {
  readonly payerWallet: string;
  readonly thresholdLedgers: number;
  readonly extendToLedgers: number;
  readonly perJobMaxStroops: bigint;
  readonly per30DaysMaxStroops: bigint;
}

export function autopilotOnBody(s: AutopilotSettings): string {
  return JSON.stringify({
    autopilot: {
      enabled: true,
      payerWallet: s.payerWallet,
      thresholdLedgers: s.thresholdLedgers,
      extendToLedgers: s.extendToLedgers,
      budget: {
        perJobMaxStroops: s.perJobMaxStroops.toString(),
        per30DaysMaxStroops: s.per30DaysMaxStroops.toString(),
      },
    },
  });
}

export async function turnAutopilotOn(
  network: 'testnet',
  contractId: string,
  settings: AutopilotSettings,
  fetchImpl?: FetchLike,
): Promise<AutopilotOnOutcome> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  }
  const res = await apiRequest<unknown>(
    `/watchlist/${encodeURIComponent(network)}/${encodeURIComponent(contractId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Evergreen-CSRF': me.data.csrfToken },
      body: autopilotOnBody(settings),
    },
    fetchImpl,
  );
  if (res.kind !== 'ok') return res;
  return { kind: 'on' };
}

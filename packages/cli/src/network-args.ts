/**
 * `--network testnet|mainnet` is global (PH2-E1-03): it applies to `scan` and
 * `extend` alike, so it is lifted out of argv before either command's own
 * parser sees it. That keeps the per-command parsers strict — they still refuse
 * every option they do not know — without each one learning the same flag.
 *
 * Only the value's presence is checked here; whether it names a real network is
 * core's `resolveNetwork`, the one place that knows the table.
 */
export function takeNetworkFlag(args: readonly string[]): {
  readonly network?: string;
  readonly rest: readonly string[];
  readonly error?: string;
} {
  const rest: string[] = [];
  let network: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg !== '--network') {
      rest.push(arg);
      continue;
    }
    if (network !== undefined) return { rest: args, error: 'Repeated option: --network' };
    const value = args[i + 1];
    if (value === undefined || value.startsWith('-')) {
      return { rest: args, error: '--network needs a value: testnet or mainnet' };
    }
    network = value;
    i++;
  }
  return network === undefined ? { rest } : { network, rest };
}

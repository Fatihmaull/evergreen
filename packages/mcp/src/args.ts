/**
 * The server's only option: `--network testnet|mainnet`, read once at start.
 * Anything else is refused, so a typo cannot silently fall back to a default.
 */
export function networkFromArgs(args: readonly string[]): {
  readonly network?: string;
  readonly error?: string;
} {
  if (args.length === 0) return {};
  if (args.length === 2 && args[0] === '--network' && !args[1]!.startsWith('-')) {
    return { network: args[1]! };
  }
  return { error: 'usage: evergreen-mcp [--network testnet|mainnet]' };
}

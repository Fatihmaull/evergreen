# @evergreen-stellar/mcp

A read-only [MCP](https://modelcontextprotocol.io) server for Evergreen (`PH2-E1-07`). It imports `core`, so its answers are the CLI's answers.

**Tools** (both read-only; nothing here signs, submits or holds a key):
- `scan` — `{ contractIds, dataKeys? }` (at most **10 contracts per call**, `MAX_CONTRACTS_PER_CALL` in `src/server.ts`; a longer list is refused, not truncated) → the `ScanResult` that `evergreen scan --json` returns for the same scope.
- `cost` — `{ contractId, dataKeys?, additionalLedgers? }` → a simulated estimate of what an extend would cost (default 518,400 ledgers, as the CLI's `--cost`). An estimate to budget against, not a quoted price.

**Configuration is the server's, never a tool argument's:**
- the network is chosen once at start: `--network testnet|mainnet`, else `EVERGREEN_NETWORK`, else testnet;
- the RPC URL comes from `SOROBAN_RPC_URL` only. Tool arguments are visible in chat and a URL can carry a provider key, so the input schemas are strict and refuse an `rpcUrl` argument.

```json
{ "mcpServers": { "evergreen": { "command": "evergreen-mcp", "env": { "EVERGREEN_NETWORK": "testnet" } } } }
```

**Tests** never touch the network. `test/server.test.ts` drives the server in memory against a recorded RPC fixture; `test/stdio-smoke.test.ts` bundles `evergreen-mcp`, spawns it, and over stdio checks that `tools/list` returns exactly `scan` and `cost` and that a `tools/call` carrying `rpcUrl` or `network` is refused by the strict schema.

Not yet published; the release owner is Rakha. It is a separate package so the CLI keeps one runtime dependency.

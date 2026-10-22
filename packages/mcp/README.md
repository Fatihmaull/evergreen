# @evergreen-stellar/mcp

A read-only [MCP](https://modelcontextprotocol.io) server for Evergreen (`PH2-E1-07`). It imports `core`, so its answers are the CLI's answers.

**Tools** (both read-only; nothing here signs, submits or holds a key):
- `scan` — `{ contractIds, dataKeys? }` → the `ScanResult` that `evergreen scan --json` returns for the same scope.
- `cost` — `{ contractId, dataKeys?, additionalLedgers? }` → a simulated estimate of what an extend would cost (default 518,400 ledgers, as the CLI's `--cost`). An estimate to budget against, not a quoted price.

**Configuration is the server's, never a tool argument's:**
- the network is chosen once at start: `--network testnet|mainnet`, else `EVERGREEN_NETWORK`, else testnet;
- the RPC URL comes from `SOROBAN_RPC_URL` only. Tool arguments are visible in chat and a URL can carry a provider key, so the input schemas are strict and refuse an `rpcUrl` argument.

```json
{ "mcpServers": { "evergreen": { "command": "evergreen-mcp", "env": { "EVERGREEN_NETWORK": "testnet" } } } }
```

Not yet published; the release owner is Rakha. It is a separate package so the CLI keeps one runtime dependency.

// Reference only: same runCli scan under Node 24 against the recorded RPC bytes, CPU per iteration (warm).
import '../tools/fetch-preload.mjs';
import { runCli } from '../../../packages/cli/dist/command.js';
import { connectTestnet } from '../../../packages/core/dist/index.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const deps = { connect: () => connectTestnet('https://soroban-testnet.stellar.org'), readKeysFile: async () => '', now: () => new Date() };
for (let i = 0; i < 10; i++) await runCli(['scan', A, '--json'], deps);
const N = 100, c0 = process.cpuUsage(), t0 = performance.now();
for (let i = 0; i < N; i++) await runCli(['scan', A, '--json'], deps);
const c = process.cpuUsage(c0);
console.log(JSON.stringify({ runtime: 'node ' + process.version, iterations: N, cpuMsPerScan: +((c.user + c.system) / 1000 / N).toFixed(2), wallMsPerScan: +((performance.now() - t0) / N).toFixed(2) }));

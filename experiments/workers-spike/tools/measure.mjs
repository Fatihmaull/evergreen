// LOCAL, INDICATIVE measurements against `wrangler dev` (workerd). NOT free-plan enforcement.
// CPU = delta of on-CPU nanoseconds (/proc/<pid>/task/*/schedstat) of the workerd process that owns the port,
// divided by N sequential warm requests. It includes workerd's own HTTP/TLS handling, the dev proxy and GC, and
// is therefore an UPPER-ish bound for the isolate's JS CPU; Cloudflare's billed "CPU time" is not exposed locally.
// (performance.now()/Date.now() inside a Worker only advance on I/O, so in-Worker timers cannot measure CPU.)
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
const [port, route, replay, n = '30', label = ''] = process.argv.slice(2);
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const G = 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';
const NOW = '2026-10-15T12:01:37.192Z';
const pid = execSync(`ss -ltnp 'sport = :${port}'`).toString().match(/pid=(\d+)/)[1];
const cpuNs = () => readdirSync(`/proc/${pid}/task`).reduce((s, t) => s + Number(readFileSync(`/proc/${pid}/task/${t}/schedstat`, 'utf8').split(' ')[0]), 0);
const url = {
  'scan-json': `/scan?contract=${A}&format=json`,
  'scan-human': `/scan?contract=${A}&format=human`,
  'sign-bench': `/sign-bench?contract=${A}&source=${G}`,
  'extend-dryrun': `/extend-dryrun?contract=${A}&source=${G}&ledgers=1000`,
}[route] + (replay === '1' ? `&replay=1&now=${NOW}` : '');
const hit = async () => {
  const t = performance.now();
  const r = await fetch(`http://localhost:${port}${url}`);
  await r.text();
  return { ms: performance.now() - t, sub: Number(r.headers.get('x-subrequests')), status: r.status, wall: Number(r.headers.get('x-wall-ms')), exit: r.headers.get('x-exit-code') };
};
// idle noise
const i0 = cpuNs(); await new Promise((r) => setTimeout(r, 2000)); const idleMs = (cpuNs() - i0) / 1e6;
const c0 = cpuNs(); const first = await hit(); const coldMs = (cpuNs() - c0) / 1e6;
const N = Number(n); const samples = [];
const c1 = cpuNs();
for (let i = 0; i < N; i++) samples.push(await hit());
const warmCpuMs = (cpuNs() - c1) / 1e6 / N;
samples.sort((a, b) => a.ms - b.ms);
console.log(JSON.stringify({
  label, port, route, mode: replay === '1' ? 'replay(no network)' : 'live testnet', n: N,
  status: [...new Set(samples.map((s) => s.status))], exit: [...new Set(samples.map((s) => s.exit))],
  subrequests: [...new Set(samples.map((s) => s.sub))],
  firstRequestCpuMs: +coldMs.toFixed(1), warmCpuMsPerRequest: +warmCpuMs.toFixed(2), idleCpuMsPer2s: +idleMs.toFixed(1),
  clientWallMs: { p50: +samples[Math.floor(N / 2)].ms.toFixed(0), p90: +samples[Math.floor(N * 0.9)].ms.toFixed(0), max: +samples[N - 1].ms.toFixed(0) },
  inWorkerWallMs: { p50: samples.map((s) => s.wall).sort((a, b) => a - b)[Math.floor(N / 2)] },
}));

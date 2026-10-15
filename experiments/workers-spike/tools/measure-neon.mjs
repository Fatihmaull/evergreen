// LOCAL, INDICATIVE Neon-leg measurement against `wrangler dev` (workerd). Same CPU method as tools/measure.mjs:
// on-CPU ns of the workerd process owning the port (/proc/<pid>/task/*/schedstat) / N sequential requests.
// Read-only (SELECT 1 / SELECT version()). Prints no connection details; the Worker scrubs its own errors.
// usage: node tools/measure-neon.mjs <port> <http|ws> <queriesPerRequest> [N=30] [label]
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
const [port, transport, q, n = '30', label = ''] = process.argv.slice(2);
const pid = execSync(`ss -ltnp 'sport = :${port}'`).toString().match(/pid=(\d+)/)[1];
const cpuNs = () => readdirSync(`/proc/${pid}/task`).reduce((s, t) => s + Number(readFileSync(`/proc/${pid}/task/${t}/schedstat`, 'utf8').split(' ')[0]), 0);
const pct = (xs, p) => { const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)]; };
const hit = async () => {
  const t = performance.now();
  const r = await fetch(`http://localhost:${port}/neon?transport=${transport}&q=${q}`);
  const j = await r.json();
  return { ms: performance.now() - t, j };
};
const i0 = cpuNs(); await new Promise((r) => setTimeout(r, 2000)); const idleMs = (cpuNs() - i0) / 1e6;
const c0 = cpuNs(); const first = await hit(); const firstCpu = (cpuNs() - c0) / 1e6;
const N = Number(n); const rows = [];
const c1 = cpuNs();
for (let i = 0; i < N; i++) rows.push(await hit());
const warmCpu = (cpuNs() - c1) / 1e6 / N;
const ok = rows.filter((r) => r.j.ok);
const firstQ = ok.map((r) => r.j.queryMs[0]);
const warmQ = ok.flatMap((r) => r.j.queryMs.slice(1));
console.log(JSON.stringify({
  label, port, transport, queriesPerRequest: Number(q), n: N, okCount: ok.length,
  errors: [...new Set(rows.filter((r) => !r.j.ok).map((r) => r.j.error))],
  subrequestsPerRequest: [...new Set(rows.map((r) => JSON.stringify(r.j.subrequests)))],
  firstEverRequestCpuMs: +firstCpu.toFixed(1), warmCpuMsPerRequest: +warmCpu.toFixed(2), idleCpuMsPer2s: +idleMs.toFixed(1),
  clientWallMsPerRequest: { p50: +pct(rows.map((r) => r.ms), 0.5).toFixed(0), p95: +pct(rows.map((r) => r.ms), 0.95).toFixed(0) },
  inWorkerTotalMs: { p50: pct(ok.map((r) => r.j.totalMs), 0.5), p95: pct(ok.map((r) => r.j.totalMs), 0.95) },
  connectMs: transport === 'ws' ? { p50: pct(ok.map((r) => r.j.connectMs), 0.5), p95: pct(ok.map((r) => r.j.connectMs), 0.95) } : null,
  firstQueryMs: { p50: pct(firstQ, 0.5), p95: pct(firstQ, 0.95) },
  warmQueryMs: warmQ.length ? { p50: pct(warmQ, 0.5), p95: pct(warmQ, 0.95), samples: warmQ.length } : null,
}));

/**
 * /docs/engine/ — what the engine is, and the thing it deliberately is not.
 */
export const meta = {
  title: 'What the engine is',
  description:
    'The Evergreen engine is a scheduled job that decides, not a daemon. Why that was chosen, and what it costs you.',
  heading: 'What the engine is',
  lead: 'A scheduled job that re-reads the entries you configure and decides whether any of them need acting on. It is not a daemon, and that was a decision rather than a shortcut.',
};

export function render() {
  return `
    <h2 id="shape">A job, not a service</h2>
    <p>
      The engine runs on a schedule, reads the contracts in its config, grades every entry and
      records a decision for each one. Then it exits. There is no process to keep alive, no uptime
      to monitor, and no in-memory state between runs.
    </p>
    <p>
      <strong>This was chosen over a long-running service on purpose.</strong> ADR-001 weighed
      both. A daemon buys sub-minute reaction time, which is irrelevant when the headroom being
      defended is measured in days, and costs patching, uptime monitoring and restart handling. It
      is also harder to verify: “trust me, the daemon is running” against a log of discrete runs
      you can read.
    </p>

    <h2 id="decide-only">It decides; it does not act by default</h2>
    <p>
      A run produces one decision per entry — <span class="mono">SKIP</span> with a reason, or a
      planned extension. In <span class="mono">dry-run</span>, which is what an omitted
      <span class="mono">mode</span> means, the plan is recorded and nothing is signed or
      submitted. Live is an explicit opt-in, never a default and never inferred.
    </p>
    <p>
      A refusal is a first-class outcome, not an error. When the write guard declines a subject the
      run records <span class="mono">REFUSED BY WRITE GUARD</span> and carries on to the next
      contract — one protected subject must not abort a run, or a guard on one contract would
      silence the engine for every other.
      <a class="site-more" href="/docs/engine/guards/">Guards</a>
    </p>

    <h2 id="cost">What the schedule costs you</h2>
    <p>
      The trade is reaction time. Worst case, an entry crosses a threshold immediately after a run
      and waits a full interval before anything notices. So the interval is part of your threshold:
      set the act-now boundary with the schedule in mind, not against it.
    </p>
    <p>
      And a scheduler is not a metronome. Ours has been measured, and the delivered cadence is not
      the configured one — the figures, the delivery rate and the worst observed gap are published
      on <a class="site-more" href="/dashboard/engine/">the engine page</a> rather than repeated
      here, because a second copy of a measurement drifts from the first.
    </p>

    <h2 id="missed">A missed run has to be visible</h2>
    <p>
      If the schedule does not fire, nothing happens — and nothing happening looks exactly like
      nothing needing to happen. That is the failure mode this shape introduces, so it is treated
      as one: cold starts and scheduler reliability are alerted on, and a missed run is meant to be
      noticed rather than silently absorbed.
    </p>
  `;
}

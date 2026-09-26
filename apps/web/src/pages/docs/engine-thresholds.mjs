/**
 * /docs/engine/thresholds/ — two tiers, one boundary rule, and the schedule.
 *
 * The numbers are read from the constants the CLI and core actually use, and
 * `check:policy` already asserts those agree across every copy site.
 */
import { fmt } from '../_shared.mjs';

export const meta = {
  title: 'Thresholds and cadence',
  description:
    'The warning and act-now tiers, why the boundary is inclusive, and why your schedule sets the floor for both.',
  heading: 'Thresholds and cadence',
  lead: 'Two tiers, measured in ledgers. Both move together when you move one, and both are only as sharp as the schedule that checks them.',
};

export function render(ctx) {
  return `
    <h2 id="tiers">Two tiers</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Tier</th><th scope="col">Default</th><th scope="col">Means</th></tr></thead>
      <tbody>
        <tr><td class="num">warning</td><td class="num">${fmt(ctx.thresholds.warn)}</td><td>About seven days. Low, recoverable, and affecting only this contract.</td></tr>
        <tr><td class="num">act now</td><td class="num">${fmt(ctx.thresholds.act)}</td><td>About one day. Or temporary and low, or shared and low.</td></tr>
      </tbody>
    </table></div>
    <p class="note">
      These two figures appear in TypeScript, JSON and Python across this project, and a check
      asserts they agree in every copy. A threshold that means one thing in the CLI and another in
      CI is a defect that reads like a difference of opinion.
    </p>

    <h2 id="inclusive">The boundary is inclusive</h2>
    <p>
      An entry at <em>exactly</em> the act-now threshold fails. Remaining exactly N is already the
      margin you set out to keep, so consuming it is the event you were watching for, not the
      moment before it.
    </p>

    <h2 id="both-move">Raising one raises both</h2>
    <p>
      <span class="mono">--threshold</span> moves the act-now tier, and the warning tier widens
      with it. Raising the act-now boundary can therefore never silently narrow the earlier
      warning — which is what would happen if the warning stayed fixed while the action line moved
      past it.
    </p>
    <p>
      What changes is what is <strong>reported</strong>, never what is written. A threshold is a
      reading instrument, and moving it does not cause an extension.
    </p>

    <h2 id="cadence">Your schedule is the real floor</h2>
    <p>
      A threshold is only checked when something checks it. If the engine runs every fifteen
      minutes, an entry can cross its boundary and sit there for up to fifteen minutes before any
      decision is recorded — and that is the best case, because a scheduler does not deliver every
      run it promises.
    </p>
    <p>
      Ours has been measured rather than assumed, and the delivered rate is well below the
      configured one. The figures, and the worst gap actually observed, are on
      <a class="site-more" href="/dashboard/engine/">the engine page</a>. Set your act-now tier
      with room for the worst gap, not the nominal interval.
    </p>

    <h2 id="ci">The same numbers in CI</h2>
    <p>
      The GitHub Action takes the same <span class="mono">threshold</span> in the same units, with
      the same inclusive boundary, and a repository wanting a week of warning sets it to
      ${fmt(ctx.thresholds.warn)} rather than to the default.
      <a class="site-more" href="/docs/ci/reference/">Action reference</a>
    </p>
  `;
}

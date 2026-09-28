/**
 * /docs/engine/notifications/ — what it can tell you, and what it cannot.
 *
 * The three templates are named from the module that exports them. The
 * "not built" list is as important as the built one: a docs page that implies
 * a Slack integration is a support ticket with a delay on it.
 */
export const meta = {
  title: 'Notifications',
  description:
    'The three events the Evergreen engine notifies on, the one channel it supports, and the channels that do not exist.',
  heading: 'Notifications',
  lead: 'Three events, one channel. The list of what is not built is on this page too, because finding that out from a silent integration is worse than reading it here.',
};

export function render() {
  return `
    <h2 id="events">What it notifies on</h2>
    <div class="table-wrap"><table>
      <thead><tr><th scope="col">Event</th><th scope="col">When</th></tr></thead>
      <tbody>
        <tr><td class="num">approaching critical</td><td>An entry has crossed into the act-now tier. This is the one you act on.</td></tr>
        <tr><td class="num">bump succeeded</td><td>An extension was submitted and verified against post-state, with its transaction hash.</td></tr>
        <tr><td class="num">bump failed</td><td>An extension was attempted and did not complete. An unconfirmed result is reported as failed rather than retried.</td></tr>
      </tbody>
    </table></div>

    <h2 id="channel">The channel</h2>
    <p>
      Email. The config names the recipient by environment variable
      (<span class="mono">notifications.toEnvVar</span>) rather than carrying an address, for the
      same reason it never carries a secret: configuration gets committed.
    </p>

    <h2 id="not-built">What is not built</h2>
    <p>
      Discord, Telegram, Slack and generic webhooks are <strong>not implemented</strong>. The
      configuration will not accept them, and there is no adapter waiting behind a flag. A
      Telegram channel is a stated candidate for the next scope of work; it is not a setting.
    </p>
    <p class="note">
      This page names them because a reader who assumes a webhook exists will configure one, see
      nothing, and conclude the engine is broken. The absence is a fact about the tool, and
      publishing it costs less than the support conversation it prevents.
    </p>

    <h2 id="silence">Silence is not health</h2>
    <p>
      No notification can mean nothing crossed a threshold — or it can mean the scheduled run did
      not fire. Those are different situations that look identical from an inbox, which is why a
      missed run is alerted on separately rather than inferred from quiet.
      <a class="site-more" href="/docs/engine/">What the engine is</a>
    </p>
  `;
}

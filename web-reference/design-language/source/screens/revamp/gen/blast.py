# Writes the stand-in SVG part for the revamp reference screen. Run from the repo root:
#   python3 web-reference/design-language/source/screens/revamp/gen/blast.py web-reference/design-language/source/screens/revamp/parts
# then build.mjs. Every number is a stand-in (components.md).
import sys
out = sys.argv[1]
W = 716
contracts = [
    # name, binds/instance line, state, connected entry index
    ('oracle-feed', 'instance 1,001,330 left', 'healthy', 0),
    ('payments-v2', 'instance 41,208 left', 'warning', 0),
    ('staking-pool', 'instance 1,204,511 left', 'healthy', 1),
    ('vault-core', 'instance 702,440 left', 'undetermined', 2),
    ('legacy-router', 'instance archived', 'expired', 3),
]
entries = [
    ('code a41f…7be0', '412,872 left · ~Dec 18', 'shared by 2', True, 'healthy'),
    ('code 5e10…88ab', '1,604,511 left · ~Apr 25', '1 contract', False, 'healthy'),
    ('code 0c92…1d3a', '588,019 left · ~Dec 28', '1 contract', False, 'healthy'),
    ('code 77de…f010', 'archived · ended ~Nov 9', '1 contract', False, 'expired'),
]
rowC, cH, cW = 72, 52, 248
ex, eW = W - 268, 268
H = len(contracts) * rowC + 8
def cy(i): return 4 + i * rowC + rowC / 2
ey = [(cy(0) + cy(1)) / 2, cy(2), cy(3), cy(4)]
eH = [84, 52, 52, 52]
sel = 0
parts = [f'<svg class="graph" viewBox="0 0 {W} {H}" role="img" aria-label="Your contracts on the left, the code entries they run on on the right. Code a41f…7be0 is selected: oracle-feed and payments-v2 depend on it.">']
# edges first
for i, (n, l2, st, e) in enumerate(contracts):
    x1, y1 = cW, cy(i)
    x2, y2 = ex, ey[e]
    mid = (x1 + x2) / 2
    cls = 'edge on' if e == sel else 'edge'
    parts.append(f'<path class="{cls}" d="M{x1} {y1:.0f} C{mid:.0f} {y1:.0f}, {mid:.0f} {y2:.0f}, {x2} {y2:.0f}"/>')
SHAPE = {
    'healthy': lambda x, y: f'<circle class="s-ok" cx="{x+5}" cy="{y}" r="4.5"/>',
    'warning': lambda x, y: f'<path class="s-warn" d="M{x} {y+4.5} L{x+5} {y-4.5} L{x+10} {y+4.5} Z"/>',
    'undetermined': lambda x, y: f'<circle class="s-und" cx="{x+5}" cy="{y}" r="3.5"/>',
    'expired': lambda x, y: f'<rect class="s-exp" x="{x+1}" y="{y-4}" width="8" height="8"/>',
}
for i, (n, l2, st, e) in enumerate(contracts):
    y = cy(i) - cH / 2
    dim = '' if e == sel else ' dim-node'
    parts.append(f'<g class="cnode{dim}"><rect class="node" x="0.5" y="{y:.0f}" width="{cW}" height="{cH}" rx="6"/>'
                 + SHAPE[st](14, y + 19)
                 + f'<text class="n" x="32" y="{y+23:.0f}">{n}</text><text class="d" x="32" y="{y+41:.0f}">{l2}</text></g>')
for j, (n, l2, l3, shared, st) in enumerate(entries):
    h = eH[j]; y = ey[j] - h / 2
    on = j == sel
    cls = 'node sel' if on else ('node arch' if st == 'expired' else 'node')
    txt = ' inv' if on or st == 'expired' else ''
    dim = '' if on else ' dim-node'
    g = f'<g class="enode{dim}"><rect class="{cls}" x="{ex}" y="{y:.0f}" width="{eW-0.5}" height="{h}" rx="6"/>'
    g += f'<text class="n{txt}" x="{ex+16}" y="{y+23:.0f}">{n}</text><text class="d{txt}" x="{ex+16}" y="{y+41:.0f}">{l2}</text>'
    if shared:
        g += f'<text class="d{txt}" x="{ex+16}" y="{y+63:.0f}">{l3} · they stop together</text>'
    parts.append(g + '</g>')
parts.append('</svg>')
svg = '\n    '.join(parts)

main = f'''<main id="main" class="main overview">
  <div class="ov-head">
    <div>
      <p class="eyebrow">Blast radius · Stellar testnet</p>
      <h1>Shared code</h1>
    </div>
    <div class="actions">
      <button class="secondary" type="button">Add other contracts</button>
    </div>
  </div>

  <section class="next" aria-label="Largest shared entry">
    <div>
      <p class="label">Largest shared entry</p>
      <p><span class="next-figure ink">2</span><span class="next-unit">of your contracts run on code a41f…7be0</span></p>
      <p class="caption">412,872 ledgers left · ~Dec 18 · if it is archived, both stop at once</p>
    </div>
  </section>

  <section class="block" aria-labelledby="map-h">
    <div class="block-head">
      <h2 id="map-h">Who depends on what</h2>
      <nav class="filters" aria-label="Show">
        <a class="filter active" href="?" aria-current="true">Code</a>
        <a class="filter" href="?show=all">All entries</a>
      </nav>
    </div>
    <div class="graph-head" aria-hidden="true"><span>Your contracts</span><span>Code they run on</span></div>
    {svg}
    <p class="note">Select an entry or a contract to trace it. Only your watched contracts are drawn: others may run on the same code.</p>
  </section>
</main>
'''
panel = '''<aside class="panel-side" aria-label="code a41f…7be0">
  <div class="panel-top">
    <div>
      <h2>Code a41f…7be0</h2>
      <p class="note">Wasm hash · contract code entry</p>
    </div>
    <button class="close" type="button">Close</button>
  </div>
  <p><span class="chip healthy"><span class="shape"></span>healthy</span></p>
  <dl class="kv">
    <div><dt>Ledgers left</dt><dd class="mono">412,872</dd></div>
    <div><dt>Ends</dt><dd>ledger <span class="mono">5,812,872</span> · ~Dec 18</dd></div>
    <div><dt>Last extended</dt><dd>Nov 23 by oracle-feed's autopilot</dd></div>
  </dl>
  <p class="panel-h">If it is archived, these stop</p>
  <ul class="activity">
    <li><span>oracle-feed</span><span class="note">autopilot on</span></li>
    <li><span>payments-v2</span><span class="note">autopilot on</span></li>
  </ul>
  <p class="note">One extend of this entry covers both. Each instance entry still needs its own.</p>
  <div class="actions">
    <button class="secondary" type="button">Copy CLI command</button>
  </div>
</aside>
'''
open(out + '/blast-radius.main.html', 'w').write(main)
open(out + '/blast-radius.panel.html', 'w').write(panel)

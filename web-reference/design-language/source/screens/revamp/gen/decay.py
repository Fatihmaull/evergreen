# Writes the stand-in SVG part for the revamp reference screen. Run from the repo root:
#   python3 web-reference/design-language/source/screens/revamp/gen/decay.py web-reference/design-language/source/screens/revamp/parts
# then build.mjs. Every number is a stand-in (components.md).
import sys
out = sys.argv[1]
DAY = 17280
# ---------- big chart: oracle-feed ----------
W, H, L, R, T, B = 1100, 340, 64, 132, 36, 40
D0, D1 = 0, 40          # Oct 25 .. Dec 4
YMAX = 500000
def x(d): return L + (W - L - R) * (d - D0) / (D1 - D0)
def y(v): return T + (H - T - B) * (1 - v / YMAX)
def fmt(n): return f'{n:,}'
seg1 = [(d, 440160 - DAY * d) for d in range(0, 22, 2)] + [(22, 60000)]
seg2 = [(22, 138240)] + [(d, 138240 - DAY * (d - 22)) for d in (24, 26, 28)] + [(29, 17280)]
seg3 = [(29, 430152), (30, 412872)]
proj = [(30, 412872), (40, 412872 - DAY * 10)]
def pl(pts): return ' '.join(f'{x(d):.1f},{y(v):.1f}' for d, v in pts)
s = [f'<svg class="chart big" viewBox="0 0 {W} {H}" role="img" aria-label="oracle-feed, ledgers left from Oct 25 to Nov 24 with two extends, projected to Dec 4.">']
# y grid + labels
for v in range(0, YMAX + 1, 100000):
    s.append(f'<line class="grid" x1="{L}" x2="{W-R}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
    s.append(f'<text class="t" x="{L-10}" y="{y(v)+4:.1f}" text-anchor="end">{v//1000}k</text>')
# future shade
s.append(f'<rect class="future" x="{x(30):.1f}" y="{T}" width="{x(40)-x(30):.1f}" height="{H-T-B}"/>')
# thresholds
for v, lab, cls in [(120960, 'warning 120,960', 'band warn-b'), (17280, 'act below 17,280', 'band act-b')]:
    s.append(f'<line class="{cls}" x1="{L}" x2="{W-R}" y1="{y(v):.1f}" y2="{y(v):.1f}"/>')
    s.append(f'<text class="t band-t" x="{W-R+8}" y="{y(v)+4:.1f}">{lab}</text>')
# x labels
for d, lab in [(0, 'Oct 25'), (7, 'Nov 1'), (14, 'Nov 8'), (21, 'Nov 15'), (28, 'Nov 22'), (35, '~Nov 29')]:
    s.append(f'<text class="t" x="{x(d):.1f}" y="{H-14}" text-anchor="middle">{lab}</text>')
# now line
s.append(f'<line class="now" x1="{x(30):.1f}" x2="{x(30):.1f}" y1="{T-14}" y2="{H-B}"/>')
s.append(f'<text class="t now-t" x="{x(30)+6:.1f}" y="{T-18}">now · ledger 5,400,000</text>')
# lines and steps
for seg in (seg1, seg2, seg3):
    s.append(f'<polyline class="line" points="{pl(seg)}"/>')
for d, lo, hi, lab in [(22, 60000, 138240, 'extend now +78,240'), (29, 17280, 430152, 'autopilot +412,872')]:
    s.append(f'<line class="step" x1="{x(d):.1f}" x2="{x(d):.1f}" y1="{y(lo):.1f}" y2="{y(hi):.1f}"/>')
    s.append(f'<circle class="ext" cx="{x(d):.1f}" cy="{y(hi):.1f}" r="6"/>')
    if d == 22:
        s.append(f'<text class="t ext-t" x="{x(d)+12:.1f}" y="{y(hi)-10:.1f}">{lab}</text>')
    else:
        s.append(f'<text class="t ext-t" x="{x(d)-10:.1f}" y="{y(hi)-12:.1f}" text-anchor="end">{lab}</text>')
s.append(f'<polyline class="proj" points="{pl(proj)}"/>')
for d, v in seg1 + seg2[1:] + seg3[1:]:
    s.append(f'<circle class="dot" cx="{x(d):.1f}" cy="{y(v):.1f}" r="3.5"/>')
# tooltip at the autopilot extend
tx, ty = x(29) - 252, y(430152) + 18
s.append(f'<g class="tip"><rect x="{tx:.1f}" y="{ty:.1f}" width="236" height="96" rx="6"/>'
         f'<text class="tt" x="{tx+14:.1f}" y="{ty+24:.1f}">Nov 23 13:30 · autopilot</text>'
         f'<text class="tt d" x="{tx+14:.1f}" y="{ty+44:.1f}">17,280 → 430,152 ledgers</text>'
         f'<text class="tt d" x="{tx+14:.1f}" y="{ty+62:.1f}">rent 61,234 · fee 25,000</text>'
         f'<text class="tt d" x="{tx+14:.1f}" y="{ty+80:.1f}">tx b90d…4a07</text></g>')
s.append('</svg>')
big = '\n      '.join(s)

# ---------- strips ----------
SW, SH = 520, 44
def spark(pts_list, ymax, thr=True, end_word=None):
    def sx(d): return 2 + (SW - 4) * d / 30
    def sy(v): return 4 + (SH - 8) * (1 - min(v, ymax) / ymax)
    g = [f'<svg class="spark" viewBox="0 0 {SW} {SH}" preserveAspectRatio="none" aria-hidden="true">']
    if thr:
        g.append(f'<line class="band act-b" x1="0" x2="{SW}" y1="{sy(17280):.1f}" y2="{sy(17280):.1f}"/>')
    for pts in pts_list:
        g.append(f'<polyline class="line" points="{" ".join(f"{sx(d):.1f},{sy(v):.1f}" for d, v in pts)}"/>')
    last = pts_list[-1][-1]
    g.append('</svg>')
    return ''.join(g)
pay = [[(d, 41208 + DAY * (30 - d)) for d in range(0, 31, 2)]]
ora = [seg1 + seg2 + seg3]
stk = [[(d, 1204511 + DAY * (30 - d)) for d in range(0, 31, 2)]]
leg = [[(d, max(0, DAY * (15 - d))) for d in range(0, 16, 1)]]
rows = [
    ('payments-v2', 'warning', 'at risk', spark(pay, 600000), '41,208', '~Nov 26', ''),
    ('oracle-feed', 'healthy', 'healthy', spark(ora, 500000), '412,872', '~Dec 18', ' open'),
    ('staking-pool', 'healthy', 'healthy', spark(stk, 1800000), '1,204,511', '~Feb 2', ''),
    ('vault-core', 'undetermined', 'undetermined', '<p class="note">No expiry to draw: data keys missing.</p>', '—', '—', ''),
    ('legacy-router', 'expired', 'archived', spark(leg, 300000), '—', 'ended ~Nov 9', ''),
]
strip_html = '\n'.join(f'''    <li class="strip{o}">
      <div class="name"><span>{n}</span><span class="chip {c}"><span class="shape"></span>{w}</span></div>
      <div class="spark-cell">{sp}</div>
      <p class="mono num-cell">{v}</p>
      <p class="end-cell">{e}</p>
    </li>''' for n, c, w, sp, v, e, o in rows)

main = f'''<main id="main" class="main overview">
  <div class="ov-head">
    <div>
      <p class="eyebrow">TTL decay · Stellar testnet</p>
      <h1>TTL decay</h1>
    </div>
    <nav class="filters" aria-label="Range">
      <a class="filter" href="?range=7d">7 days</a>
      <a class="filter active" href="?range=30d" aria-current="true">30 days</a>
      <a class="filter" href="?range=90d">90 days</a>
    </nav>
  </div>

  <section class="chart-card" aria-labelledby="sel-h">
    <div class="chart-top">
      <div>
        <p class="label" id="sel-h">oracle-feed · binds on code</p>
        <p><span class="sel-figure">412,872</span> <span class="sel-unit">ledgers left · ends ~Dec 18</span></p>
      </div>
      <p class="legend">
        <span><i class="lg-dot"></i>observation</span>
        <span><i class="lg-ext"></i>extend</span>
        <span><i class="lg-proj"></i>projection</span>
      </p>
    </div>
    <figure class="chart-wrap">
      {big}
      <figcaption class="note">Each dot is a recorded reading. Each step is a recorded extend: select it for the transaction. Dates are estimates from ledgers at 5 s each.</figcaption>
    </figure>
  </section>

  <section class="block" aria-labelledby="all-h">
    <div class="block-head">
      <h2 id="all-h">All contracts, last 30 days</h2>
    </div>
    <ul class="strips">
{strip_html}
    </ul>
    <p class="note">Each row has its own vertical scale; the line across is the autopilot threshold. Select a row to chart it above.</p>
  </section>
</main>
'''
open(out + '/decay.main.html', 'w').write(main)

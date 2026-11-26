#!/usr/bin/env python3
"""Build the LVRF demo cards (HTML) and render them to PNG at 2x (2880x1800).

From the repo, on the Mac (needs Python's playwright: pip install playwright):
  cd scripts/demo/cards
  LVRF_FONTS=../../../client/public/fonts LVRF_CARDS_OUT=~/lvrf-backups/demo-cards python3 build.py ../../../client/tailwind.config.js

Colours are read from the repo's tailwind.config.js, never retyped (CLAUDE.md, the one document registry rule).
Fonts are the repo's self-hosted faces (client/public/fonts).
Counts that change with each migration live in COUNTS, so a re-render after a deploy is one edit.
"""
import re, os, sys, html, pathlib, asyncio

HERE = pathlib.Path(__file__).parent
CFG = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/user-data/uploads/lvrf-rule76/client/tailwind.config.js')
OUT = pathlib.Path(os.environ.get('LVRF_CARDS_OUT', str(HERE / 'png'))).expanduser()
FONTS = os.environ.get('LVRF_FONTS', 'fonts')  # relative to this folder, or an absolute file:// path
OUT.mkdir(parents=True, exist_ok=True)

cfg = CFG.read_text()
T = dict(re.findall(r"'?([a-z0-9-]+)'?:\s*'(#[0-9A-Fa-f]{6})'", cfg))
for k in ('ink', 'gold', 'silver', 'offwhite', 'ink-45', 'ink-70', 'healthy', 'warning', 'critical'):
    assert k in T, k

# Production counts, as read at Gate C. Update after a deploy and re-run.
COUNTS = {'triggers': 229, 'checks': 160, 'migration': '0054', 'as_of': '25 Nov 2026'}

def e(s):
    return html.escape(s, quote=False)

CSS = f"""
@font-face {{ font-family: 'Bebas Neue'; src: url('{FONTS}/bebas-neue/BebasNeue-Regular.ttf'); }}
@font-face {{ font-family: 'Barlow'; font-weight: 300; src: url('{FONTS}/barlow/Barlow-Light.ttf'); }}
@font-face {{ font-family: 'Barlow'; font-weight: 400; src: url('{FONTS}/barlow/Barlow-Regular.ttf'); }}
@font-face {{ font-family: 'Barlow'; font-weight: 500; src: url('{FONTS}/barlow/Barlow-Medium.ttf'); }}
@font-face {{ font-family: 'Barlow'; font-weight: 600; src: url('{FONTS}/barlow/Barlow-SemiBold.ttf'); }}
@font-face {{ font-family: 'Barlow'; font-style: italic; font-weight: 400; src: url('{FONTS}/barlow/Barlow-Italic.ttf'); }}
@font-face {{ font-family: 'Barlow Condensed'; font-weight: 400; src: url('{FONTS}/barlow-condensed/BarlowCondensed-Regular.ttf'); }}
@font-face {{ font-family: 'Barlow Condensed'; font-weight: 600; src: url('{FONTS}/barlow-condensed/BarlowCondensed-SemiBold.ttf'); }}
:root {{
  --ink: {T['ink']}; --gold: {T['gold']}; --silver: {T['silver']}; --offwhite: {T['offwhite']};
  --ink-70: {T['ink-70']}; --ink-45: {T['ink-45']}; --healthy: {T['healthy']}; --warning: {T['warning']}; --critical: {T['critical']};
}}
* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{ width: 1440px; height: 900px; background: var(--ink); color: var(--offwhite); overflow: hidden; }}
body {{ font-family: 'Barlow', sans-serif; font-weight: 400; -webkit-font-smoothing: antialiased; }}
.card {{ position: absolute; inset: 0; padding: 64px 96px 0; display: flex; flex-direction: column; }}
h1 {{ font-family: 'Bebas Neue', sans-serif; font-weight: 400; font-size: 84px; line-height: .94; letter-spacing: .005em; }}
h1 .w {{ display: block; color: var(--offwhite); }}
h1 .g {{ display: block; color: var(--gold); }}
.rule {{ width: 96px; height: 3px; background: var(--gold); margin: 26px 0 0; }}
.body {{ flex: 1; display: flex; padding-top: 40px; min-height: 0; }}
.foot {{ height: 76px; display: flex; align-items: center; justify-content: space-between; gap: 48px;
  border-top: 1px solid var(--ink-70); font-family: 'Barlow Condensed', sans-serif; font-size: 15px; color: var(--silver); letter-spacing: .02em; }}
.foot .src {{ max-width: 1040px; line-height: 1.3; }}
.foot .mark {{ font-weight: 600; letter-spacing: .22em; color: var(--gold); white-space: nowrap; font-size: 13px; }}
p.lead {{ font-size: 25px; line-height: 1.42; font-weight: 300; color: var(--offwhite); max-width: 60ch; }}
.muted {{ color: var(--silver); }}
.gold {{ color: var(--gold); }}
b, strong {{ font-weight: 600; }}
"""

def page(title_w, title_g, body, source, extra_css='', size=None):
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra_css}</style></head>
<body><div class="card">
<h1{f' style="font-size:{size}px"' if size else ''}><span class="w">{e(title_w)}</span><span class="g">{e(title_g)}</span></h1>
<div class="rule"></div>
<div class="body">{body}</div>
<div class="foot"><div class="src">{e(source)}</div><div class="mark">RULE 76 &nbsp;/&nbsp; LVRF</div></div>
</div></body></html>"""

cards = {}

# ── 01 The catalyst ─────────────────────────────────────────────────────────────
cards['01-catalyst'] = page(
    'Skillsoft promises to prove impact.',
    'LVRF is how that proof survives a CFO.',
    """
<div class="cat">
  <div class="fig">
    <div class="n">98<span>%</span></div>
    <div class="cap">Skillsoft's last-12-month dollar retention, down from 99% a year earlier.</div>
  </div>
  <div class="pts">
    <p>Renewals are decided by the customer's CFO, in procurement. A usage report is not an outcome.</p>
    <p>LVRF builds each account's case from the customer's own metric, a target committed by a named person on their side, and an actual from their system of record.</p>
    <p>Every point of retention becomes an argument Skillsoft can defend, account by account.</p>
  </div>
</div>""",
    "Skillsoft Q2 FY2027 results, 9 Sep 2026 (LTM dollar retention 98%, against 99% a year earlier). "
    "“Proves the impact of skills on business outcomes”: Skillsoft's company description, Q1 FY2027 release, 9 Jun 2026.",
    """
.cat { display: grid; grid-template-columns: 430px 1fr; gap: 88px; align-items: start; width: 100%; }
.fig .n { font-family: 'Bebas Neue'; font-size: 260px; line-height: .8; color: var(--gold); }
.fig .n span { font-size: 140px; }
.fig .cap { margin-top: 22px; font-size: 21px; line-height: 1.4; color: var(--silver); max-width: 26ch; }
.pts p { font-size: 25px; line-height: 1.42; font-weight: 300; padding: 0 0 22px 26px; border-left: 3px solid var(--ink-70); margin-bottom: 22px; }
.pts p:last-child { border-left-color: var(--gold); font-weight: 500; margin-bottom: 0; }
""")

# ── 02 Why now ──────────────────────────────────────────────────────────────────
cards['02-why-now'] = page(
    'AI made claims cheap.',
    'Proof is the scarce thing now.',
    """
<div class="why">
  <div><h3>The promise moved</h3><p>Skillsoft now calls itself an AI-native skills platform. Proving business impact is part of what it sells.</p></div>
  <div><h3>The stakes rose</h3><p>Dollar retention over the last twelve months is 98%, and fiscal 2027 revenue guidance was revised to $380–390M. The renewal argument has never been worth more.</p></div>
  <div><h3>The hard truth</h3><p>The accounts easiest to sell are the hardest to prove. LVRF says where value engineering should point first, before a renewal finds out.</p></div>
  <div><h3>It's ready</h3><p>LVRF 3.0 was ratified on 15 November 2026, ready to run an engagement. The 2027 accounts can start on it now.</p></div>
</div>""",
    "Skillsoft Q1 and Q2 FY2027 results, 9 Jun and 9 Sep 2026. The proof asymmetry: R76-LVRF-PROP-001, Finding III. "
    "LVRF 3.0, ratified by Brad Piver, 15 Nov 2026.",
    """
.why { display: grid; grid-template-columns: 1fr 1fr; gap: 40px 72px; width: 100%; align-content: start; }
.why h3 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 24px; color: var(--gold); margin-bottom: 10px; letter-spacing: .01em; }
.why p { font-size: 23px; line-height: 1.42; font-weight: 300; max-width: 46ch; }
""")

# ── 03 Not just value engineering ───────────────────────────────────────────────
rows = [
    ('Models the ROI before the sale', 'Runs past the signature: commit, measure, verify, return'),
    ('Assumptions typed into a model', 'Evidence with a named source. A missing figure stays missing, and says why'),
    ('One number', 'Two answers: did the value happen, and how well do we know it (0–100, computed)'),
    ('Learning as a cost line', 'Learning as the mechanism: a 13-stage learning spine inside the value spine'),
    ('The same deck for every room', 'Lenses: the CFO lens refuses a weak case and lists the asks that clear it'),
]
tr = ''.join(f'<div class="l">{e(a)}</div><div class="r">{e(b)}</div>' for a, b in rows)
cards['03-not-just-ve'] = page(
    'Value engineering builds the case.',
    'LVRF proves it happened.',
    f"""<div class="vs"><div class="hl">A value engineering tool</div><div class="hr">LVRF</div>{tr}</div>""",
    "LVRF Design Specification, §1 (the two axes: realization and evidence) and §2; "
    "working constitution, “The two spines” (7-stage value spine, 13-stage learning spine).",
    """
.vs { display: grid; grid-template-columns: 460px 1fr; width: 100%; align-content: start; }
.vs .hl, .vs .hr { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 22px; padding-bottom: 14px; border-bottom: 2px solid var(--ink-70); }
.vs .hl { color: var(--silver); }
.vs .hr { color: var(--gold); border-bottom-color: var(--gold); padding-left: 40px; }
.vs .l, .vs .r { font-size: 23px; line-height: 1.32; padding: 17px 0; border-bottom: 1px solid var(--ink-70); }
.vs .l { color: var(--silver); font-weight: 300; padding-right: 32px; }
.vs .r { padding-left: 40px; font-weight: 400; }
""")

# ── 04 Principles ───────────────────────────────────────────────────────────────
pr = [
    ('Zero is data.', 'A score of 0 is a result, never a blank.'),
    ('Nothing is deleted.', 'A correction supersedes the old row. Both survive.'),
    ('The audit log only grows.', 'Not even the application can rewrite it.'),
    ('A person authorizes.', 'AI may draft. It is never the assessor, the reviewer or the verifier.'),
    ('Evidence names its source.', 'Without one, it is an assertion.'),
    ('Unverified looks unverified.', 'The banner is never hidden to make a page look finished.'),
    ('The customer’s side commits.', 'Only a customer-side person commits a target or verifies a result.'),
    ('The record is the database.', 'Not a prompt, and not a model’s memory.'),
]
items = ''.join(f'<div class="pi"><b>{e(a)}</b> <span>{e(b)}</span></div>' for a, b in pr)
cards['04-principles'] = page(
    'Rules the database enforces.',
    'Not good intentions.',
    f"""<div class="pg">{items}</div>""",
    "LVRF working constitution (CLAUDE.md), rules 1–6 and 10, and the governing AI principle; "
    "only a customer-side person commits or verifies (LVRF_PLAN §29, 24 Nov 2026).",
    """
.pg { display: grid; grid-template-columns: 1fr 1fr; gap: 0 72px; width: 100%; align-content: start; }
.pi { padding: 18px 0; border-bottom: 1px solid var(--ink-70); font-size: 23px; line-height: 1.36; }
.pi b { display: block; font-family: 'Bebas Neue'; font-weight: 400; font-size: 34px; letter-spacing: .01em; color: var(--offwhite); margin-bottom: 2px; }
.pi:nth-last-child(1) b, .pi:nth-last-child(1) { color: var(--gold); }
.pi span { color: var(--silver); font-weight: 300; }
.pi:nth-last-child(1) span { color: var(--offwhite); font-weight: 400; }
""")

# ── 05 Architecture ─────────────────────────────────────────────────────────────
c = COUNTS
cards['05-architecture'] = page(
    'One record, one database.',
    'Four layers that refuse on their own.',
    f"""
<div class="arch">
  <div class="main">
    <div class="flow">
      <div class="node"><h4>Browser</h4><p>Signed-in vendor staff. Customers never sign in.</p></div>
      <div class="arrow"></div>
      <div class="node"><h4>The gate</h4><p>TLS, and a site gate in front of everything.</p></div>
      <div class="arrow"></div>
      <div class="node"><h4>The API</h4><p>Sessions name the actor. Every route checks the company.</p></div>
    </div>
    <div class="down"></div>
    <div class="node db">
      <div class="dbl"><h4>PostgreSQL: the record</h4>
        <p>Every fact, evidence row, run and act lives here.</p>
        <p class="big"><span>{c['triggers']}</span> triggers</p><p class="big"><span>{c['checks']}</span> check constraints</p></div>
      <div class="dbr">
        <p>The app’s role owns nothing, so it cannot drop a trigger or rewrite the audit log.</p>
        <p>Backed up nightly. Each backup is validated before it is kept.</p>
      </div>
    </div>
  </div>
  <div class="side">
    <div class="node ai"><h4>Research with Claude</h4><p>Its own process alone holds the key. Results are staged, and a person accepts each field into the record.</p></div>
    <div class="dd">
      <h4>Defence in depth</h4>
      <div class="layers">
        <div><b>Evidence taxonomy</b><span>what kind of evidence, and where from</span></div>
        <div><b>Database triggers</b><span>the amendment cited in the refusal</span></div>
        <div><b>Application checks</b><span>no measure without admissible evidence</span></div>
        <div><b>State guards</b><span>no verify before measure</span></div>
      </div>
      <p class="note">Each layer reaches the same refusal without knowing about the others.</p>
    </div>
  </div>
</div>""",
    f"LVRF Design Specification, §4 (architecture, defence in depth). Counts read on production at migration {c['migration']}, "
    f"{c['as_of']}. Research process: LVRF_PLAN §21 (S2), deployed and switched off until cleared.",
    """
.arch { display: grid; grid-template-columns: 1fr 440px; gap: 56px; width: 100%; align-items: start; }
.flow { display: grid; grid-template-columns: 1fr 40px 1fr 40px 1fr; align-items: stretch; }
.down { height: 34px; margin-left: calc(83.3% - 1px); border-left: 2px solid var(--ink-45); position: relative; }
.down::after { content: ''; position: absolute; left: -7px; bottom: -2px; border: 6px solid transparent; border-top: 8px solid var(--ink-45); border-bottom: 0; }
.node.db { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; padding: 22px 24px; }
.node { border: 1px solid var(--ink-70); padding: 16px 16px 18px; }
.node h4 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 21px; color: var(--offwhite); margin-bottom: 8px; }
.node p { font-size: 17.5px; line-height: 1.38; color: var(--silver); font-weight: 400; }
.node.db { border: 2px solid var(--gold); }
.node.db h4 { color: var(--gold); font-size: 22px; }
.node.db p { margin-bottom: 12px; color: var(--offwhite); font-size: 19px; }
.node.db .dbr { border-left: 1px solid var(--ink-70); padding-left: 28px; align-self: center; }
.node.db p.big { white-space: nowrap; margin: 6px 0 0; font-family: 'Bebas Neue'; font-size: 28px; letter-spacing: .02em; color: var(--silver); }
.node.db p.big span { font-size: 64px; color: var(--gold); }
.arrow { position: relative; }
.arrow::before { content: ''; position: absolute; left: 4px; right: 6px; top: 50%; height: 2px; background: var(--ink-45); }
.arrow::after { content: ''; position: absolute; right: 2px; top: calc(50% - 5px); border: 6px solid transparent; border-left: 8px solid var(--ink-45); border-right: 0; }
.side { display: flex; flex-direction: column; gap: 24px; }
.node.ai { border-style: dashed; }
.dd h4 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 21px; margin-bottom: 12px; color: var(--offwhite); }
.layers div { display: flex; flex-direction: column; padding: 10px 0 10px 18px; border-left: 3px solid var(--gold); margin-bottom: 8px; background: rgba(255,255,255,.02); }
.layers b { font-size: 18px; font-weight: 600; }
.layers span { font-size: 15.5px; color: var(--silver); }
.dd .note { margin-top: 10px; font-size: 16.5px; color: var(--silver); font-style: italic; }
""")

# ── 06 AI-Assist, governed ──────────────────────────────────────────────────────
steps = [
    ('Generated', 'The prompt is built from live rows, never hand-written, and kept with its hash.'),
    ('Researched', 'Claude researches, or a person runs the prompt.'),
    ('Staged', 'Results are parsed into staging. Nothing goes straight into the record.'),
    ('Accepted', 'A person accepts or rejects each field, by name.'),
    ('Recorded', 'Accepted fields enter the database as evidence, marked AI-sourced, with the query and the tool.'),
]
st = ''.join(f'<div class="st"><div class="k">{i}</div><h4>{e(a)}</h4><p>{e(b)}</p></div>' for i, (a, b) in enumerate(steps, 1))
drift = [
    ('One definition.', 'The prompt, the parser and the acceptance read one contract. Change a field, and its version changes.'),
    ('Recomputable.', 'Every new run seals its model version and fingerprint, so its score can be recomputed.'),
    ('Checked for drift.', 'The live database is compared with its manifest and its migrations.'),
    ('Three gates.', 'Every change is tested on a throwaway copy, deployed by Brad, then checked read-only on production.'),
]
dr = ''.join(f'<p><b>{e(a)}</b> {e(b)}</p>' for a, b in drift)
cards['06-ai-assist'] = page(
    'AI assists the evidence.',
    'It never manufactures the value.',
    f"""
<div class="aiw">
  <div class="seq">{st}</div>
  <div class="guard">A database trigger refuses AI-sourced evidence as support for a measured actual. The actual comes from the customer’s system of record.</div>
  <div class="lower">
    <div class="drift"><h3>Built not to drift</h3>{dr}</div>
    <div class="mem"><div class="q">The record lives in the LVRF database.</div><div class="q2">Never in a prompt. Never in a model’s memory.</div></div>
  </div>
</div>""",
    "Working constitution: the research seam and the governing AI principle; AMENDMENT-005 Art. I (enforced as a trigger); "
    "LVRF_PLAN §21 (in-app research, deployed and switched off until cleared; today a person runs the prompt) and L42.",
    """
.aiw { width: 100%; display: flex; flex-direction: column; gap: 22px; }
.seq { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0; }
.st { padding: 0 20px 0 0; position: relative; }
.st .k { font-family: 'Bebas Neue'; font-size: 38px; color: var(--gold); line-height: 1; padding-bottom: 8px; border-bottom: 2px solid var(--gold); margin-bottom: 12px; }
.st h4 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 21px; margin-bottom: 6px; }
.st p { font-size: 16px; line-height: 1.38; color: var(--silver); }
.guard { border-left: 4px solid var(--critical); background: rgba(143,42,42,.16); padding: 14px 20px; font-size: 19px; line-height: 1.4; }
.lower { display: grid; grid-template-columns: 1fr 440px; gap: 56px; align-items: start; }
.drift h3 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 22px; color: var(--gold); margin-bottom: 8px; }
.drift p { font-size: 17.5px; line-height: 1.38; color: var(--silver); margin-bottom: 7px; }
.drift b { color: var(--offwhite); font-weight: 600; }
.mem { border: 2px solid var(--gold); padding: 22px 24px; }
.mem .q { font-family: 'Bebas Neue'; font-size: 40px; line-height: 1; color: var(--gold); }
.mem .q2 { font-family: 'Bebas Neue'; font-size: 40px; line-height: 1; color: var(--offwhite); margin-top: 6px; }
""")

# ── 07 Heartbeat and Industry Packs ─────────────────────────────────────────────
cats = ['Security', 'Governance', 'Integrity', 'Financial', 'Constitutional', 'Learning', 'Operational']
dims = [
    ('Metric library', 'The business metrics the institution already reports.'),
    ('Attestation authority', 'Who inside it can attest to that number.'),
    ('Baseline availability', 'Whether it can produce the number at all.'),
    ('Regulatory overlay', 'Where learning carries compliance value with hard-dollar consequence.'),
]
dm = ''.join(f'<div class="dim"><b>{e(a)}</b><span>{e(b)}</span></div>' for a, b in dims)
cg = ''.join(f'<span>{e(x)}</span>' for x in cats)
cards['07-heartbeat-packs'] = page(
    'Packs say what can be proven where.',
    'The Heartbeat proves the system itself.',
    f"""
<div class="hp">
  <div class="packs">
    <h3>Industry Packs</h3>
    <p class="intro">A pack records the four things that decide whether a record can exist in an industry.</p>
    <div class="dims">{dm}</div>
    <p class="earn"><b>Earned, never authored.</b> An entry is ratified only once it is sourced from two institutions’ own systems of record. Ratifying and demoting entries is next on the build list.</p>
    <p class="now">In use: Pharmaceutical &amp; Biotechnology, Manufacturing, Learning platforms. Every entry is still proposed, and says so.</p>
  </div>
  <div class="hb">
    <h3>The Heartbeat</h3>
    <div class="n">18</div>
    <div class="cap">registered heartbeats in 7 categories</div>
    <div class="cats">{cg}</div>
    <p>An event that isn’t registered is refused by the database.</p>
    <p>Unmeasured is never scored zero, and never assumed healthy.</p>
  </div>
</div>""",
    "R76-LVRF-PROP-001, §4 (the pack test) and the Design Specification, §2 (a pack is earned, never authored); "
    "pack ratification threshold N = 2 (Brad Piver, 4 Nov 2026); HEARTBEAT-REGISTER (R76-HB-001) with AMENDMENT-002.",
    """
.hp { display: grid; grid-template-columns: 1fr 400px; gap: 72px; width: 100%; align-items: start; }
.hp h3 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 24px; color: var(--gold); margin-bottom: 10px; }
.packs .intro { font-size: 20px; line-height: 1.4; font-weight: 300; margin-bottom: 16px; }
.dims { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 18px; }
.dim { border: 1px solid var(--ink-70); padding: 13px 16px; }
.dim b { display: block; font-size: 18.5px; font-weight: 600; margin-bottom: 4px; }
.dim span { font-size: 16px; line-height: 1.35; color: var(--silver); }
.packs .earn { font-size: 18px; line-height: 1.42; color: var(--silver); margin-bottom: 10px; }
.packs .earn b { color: var(--offwhite); }
.packs .now { font-size: 16.5px; color: var(--silver); font-style: italic; }
.hb { border-left: 3px solid var(--gold); padding-left: 36px; }
.hb .n { font-family: 'Bebas Neue'; font-size: 200px; line-height: .8; color: var(--gold); }
.hb .cap { font-size: 20px; color: var(--offwhite); margin: 10px 0 16px; }
.cats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
.cats span { border: 1px solid var(--ink-45); padding: 4px 10px; font-family: 'Barlow Condensed'; font-size: 16px; color: var(--silver); }
.hb p { font-size: 18px; line-height: 1.42; margin-bottom: 10px; }
""")

# ── 08 The spine ────────────────────────────────────────────────────────────────
vs = [
    ('Baseline', 'The customer’s current metric, from their own system.'),
    ('Attach', 'A capability attached to that metric: the hypothesis.'),
    ('Model', 'The target, and its financial impact.'),
    ('Commit', 'A customer-side person commits the target and the date it will be measured.'),
    ('Measure', 'The actual arrives from the system of record. AI can never supply it.'),
    ('Verify', 'A customer-side person confirms the sources and the change.'),
    ('Return', 'The finding returns to the portfolio, and to Rule76.'),
]
sp = ''.join(f'<div class="s{" b" if i == 4 else ""}"><div class="k">{i:02d}</div><h4>{e(a)}</h4><p>{e(b)}</p></div>' for i, (a, b) in enumerate(vs, 1))
ls = ['Observe', 'Assess', 'Understand', 'Plan', 'Learn', 'Practice', 'Reflect', 'Demonstrate', 'Measure', 'Preserve', 'Improve', 'Teach', 'Return to Rule76']
lc = ''.join(f'<span{" class=last" if i == len(ls) - 1 else ""}>{e(x)}</span>' for i, x in enumerate(ls))
cards['08-spine'] = page(
    'One spine, seven stages.',
    'Each one gated.',
    f"""
<div class="spw">
  <div class="spine">{sp}</div>
  <div class="bnd"><span>Before commit, everything is a hypothesis. After it, a claim waits to be measured.</span></div>
  <div class="learn">
    <div class="lh"><h3>Inside it, the learning spine</h3><p>Thirteen stages produce the capability change, nested inside attach and measure. The last stage is a write, not a label.</p></div>
    <div class="chain">{lc}</div>
  </div>
</div>""",
    "db/schema.ts: value_stage and learning_stage; Design Specification §4 (the simulation boundary at commit); "
    "the promised measurement date at commit (LVRF_PLAN §26) and customer-side commit and verify (§29).",
    """
.spw { width: 100%; display: flex; flex-direction: column; }
.spine { display: grid; grid-template-columns: repeat(7, 1fr); }
.s { padding: 0 18px 0 0; }
.s .k { font-family: 'Bebas Neue'; font-size: 30px; color: var(--silver); line-height: 1; padding-bottom: 10px; border-bottom: 3px solid var(--gold); margin-bottom: 14px; }
.s h4 { font-family: 'Bebas Neue'; font-weight: 400; font-size: 38px; line-height: 1; color: var(--offwhite); margin-bottom: 8px; }
.s p { font-size: 16.5px; line-height: 1.38; color: var(--silver); }
.s.b .k { border-bottom-style: dashed; }
.s:nth-child(n+5) .k { border-bottom-color: var(--ink-45); }
.s:nth-child(4) h4 { color: var(--gold); }
.bnd { margin: 22px 0 26px; font-size: 17px; color: var(--silver); font-style: italic; display: flex; align-items: center; gap: 14px; }
.bnd::before { content: ''; width: 36px; border-top: 3px dashed var(--gold); }
.learn { border-top: 1px solid var(--ink-70); padding-top: 22px; display: grid; grid-template-columns: 380px 1fr; gap: 40px; align-items: start; }
.lh h3 { font-family: 'Barlow Condensed'; font-weight: 600; font-size: 22px; color: var(--gold); margin-bottom: 6px; }
.lh p { font-size: 17px; line-height: 1.4; color: var(--silver); }
.chain { display: flex; flex-wrap: wrap; gap: 8px 6px; align-content: start; }
.chain span { font-family: 'Barlow Condensed'; font-size: 18px; padding: 5px 11px; border: 1px solid var(--ink-45); color: var(--offwhite); }
.chain span.last { border-color: var(--gold); color: var(--gold); font-weight: 600; }
""")

# ── 09 Outputs ──────────────────────────────────────────────────────────────────
outs = [
    ('Point of view', '', 'Outside-in: built from published material, every figure with its source, and marked unverified on every page.'),
    ('Value case', '', 'Two lenses on one sealed run. The CFO lens refuses until the evidence is there, and lists the asks that clear it.'),
    ('Story of record', 'New', 'Sealed when the steward issues it, never edited. Its stage follows the evidence: reference, decision, realization, compounding.'),
    ('War Room', '', 'Every live engagement in one view: what is due, confirmed, refuted or late. It never sums or averages money across accounts.'),
]
oc = ''.join(f'<div class="o"><div class="tag">{f"<em>{e(t)}</em>" if t else ""}</div><h4>{e(a)}</h4><p>{e(b)}</p></div>' for a, t, b in outs)
cards['09-outputs'] = page(
    'What LVRF puts in front of a CFO.',
    'Every page traceable to its record.',
    f"""
<div class="ow">
  <div class="og">{oc}</div>
  <div class="hash"><span class="lbl">Every printed page carries its banners and the run’s record hash</span>
  <span class="h">record hash fb2917d18928c1eda1f5735d11ff402c01cea13f5282ac02fc98f2b30c0c372c</span></div>
</div>""",
    "The printed value case and point of view (LVRF_PLAN §22, S3); the Story of record (§27, S7); the War Room (§25, S6). "
    "The hash shown is Skillsoft run 3’s, as printed on 19 Nov 2026.",
    """
.ow { width: 100%; display: flex; flex-direction: column; gap: 44px; }
.og { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
.o { border-top: 3px solid var(--gold); padding-top: 18px; }
.o h4 { font-family: 'Bebas Neue'; font-weight: 400; font-size: 48px; line-height: 1; margin-bottom: 14px; white-space: nowrap; }
.o .tag { height: 26px; margin-bottom: 6px; }
.o .tag em { display: inline-block; font-family: 'Barlow Condensed'; font-style: normal; font-weight: 600; font-size: 15px; letter-spacing: .08em; color: var(--ink); background: var(--gold); padding: 2px 8px; }
.o p { font-size: 22px; line-height: 1.45; color: var(--silver); }
.hash { border: 1px solid var(--ink-70); padding: 20px 24px; display: flex; flex-direction: column; gap: 8px; }
.hash .lbl { font-size: 21px; color: var(--offwhite); }
.hash .h { font-family: ui-monospace, 'DejaVu Sans Mono', monospace; font-size: 21px; color: var(--gold); letter-spacing: .02em; }
""")

# ── 10 Defensible ───────────────────────────────────────────────────────────────
pil = [
    ('Provenance', 'Every figure names its source, and the person who opened it.'),
    ('Truth', 'A fact is exactly as true as its evidence. A missing figure stays missing, and says why.'),
    ('Governance', 'A person decides, by name. Every act is recorded, and nothing is edited after the fact.'),
]
pc = ''.join(f'<div class="p"><h4>{e(a)}</h4><p>{e(b)}</p></div>' for a, b in pil)
cards['10-defensible'] = page(
    'Rule76 makes it better.',
    'Everything is defensible.',
    f"""
<div class="dw">
  <div class="pl">{pc}</div>
  <div class="close"><span>Every figure carries its basis.</span><span>Every act names its person.</span><span class="g">Every record carries its hash.</span></div>
</div>""",
    "LVRF 3.0 (ratified 15 Nov 2026), “The governing disciplines”: Provenance, Truth and Governance, stated from the rules in force.",
    """
.dw { width: 100%; display: flex; flex-direction: column; gap: 84px; padding-top: 12px; }
.pl { display: grid; grid-template-columns: repeat(3, 1fr); gap: 56px; }
.p h4 { font-family: 'Bebas Neue'; font-weight: 400; font-size: 72px; line-height: 1; color: var(--gold); margin-bottom: 12px; }
.p p { font-size: 25px; line-height: 1.42; font-weight: 300; max-width: 28ch; }
.close { display: flex; flex-direction: column; gap: 8px; font-family: 'Bebas Neue'; font-size: 52px; border-left: 4px solid var(--gold); padding-left: 28px; line-height: 1; flex-wrap: wrap; }
.close .g { color: var(--gold); }
""")


BOOK = 'The Philosophy of Institutional Stewardship (Brad Piver, Rule76, 2026)'

# ── 00a Matt ────────────────────────────────────────────────────────────────────
cards['00a-matt'] = page(
    'Matt, you’ve known me for most of my career.',
    'A few months ago, you reached out.',
    """
<div class="letter">
  <p>This is my answer. What I’ve built since, why I built it, and what it can do for Skillsoft right now.</p>
  <div class="sig">Brad Piver<span>Rule76, Sarasota, Florida</span></div>
</div>""",
    'The walkthrough that follows is recorded from LVRF’s live system, read-only.',
    """
.letter { width: 100%; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 40px; }
.letter p { font-size: 38px; line-height: 1.4; font-weight: 300; max-width: 40ch; }
.sig { font-family: 'Bebas Neue'; font-size: 48px; color: var(--gold); line-height: 1; border-left: 4px solid var(--gold); padding-left: 24px; }
.sig span { display: block; font-family: 'Barlow'; font-size: 20px; color: var(--silver); margin-top: 10px; letter-spacing: .01em; }
""")

# ── 00b What Rule 76 is ─────────────────────────────────────────────────────────
cards['00b-rule76'] = page(
    'Rule 76 is a standard,',
    'not a number.',
    """
<div class="r76">
  <div class="half"><div class="big">Rule</div><p>Institutions need governing principles: a straight edge their actions can be measured against.</p></div>
  <div class="half"><div class="big">76</div><p>As in 1776, when a purpose was declared before any mechanism existed to serve it. Principles worthy of being handed to the next generation.</p></div>
  <div class="creed"><div class="q">“Leave it better than you found it.”</div><p>A Scout creed I carried for forty years before I learned where it came from. Rule 76 is the mark; the creed is inherited, and I credit it.</p></div>
  <div class="std"><span>The standard:</span> clear source, clear confidence, clear ownership, clear next action.</div>
</div>""",
    f'{BOOK}, “The Constitutional Origin of Rule76” and the Rule 76 standard.',
    """
.r76 { width: 100%; display: grid; grid-template-columns: 1fr 1fr; gap: 26px 72px; align-content: start; }
.half .big { font-family: 'Bebas Neue'; font-size: 96px; line-height: .9; color: var(--gold); margin-bottom: 8px; }
.half p { font-size: 24px; line-height: 1.42; font-weight: 300; max-width: 40ch; }
.creed { grid-column: 1 / -1; border-top: 1px solid var(--ink-70); padding-top: 22px; display: grid; grid-template-columns: auto 1fr; gap: 40px; align-items: center; }
.creed .q { font-family: 'Bebas Neue'; font-size: 46px; color: var(--offwhite); white-space: nowrap; }
.creed p { font-size: 19px; line-height: 1.42; color: var(--silver); }
.std { grid-column: 1 / -1; font-size: 25px; margin-top: 6px; color: var(--offwhite); }
.std span { color: var(--gold); font-weight: 600; }
""")

# ── 00c Why I built it ──────────────────────────────────────────────────────────
cards['00c-why-built'] = page(
    'In 35 years, I saw too many business cases',
    'that couldn’t survive without their author.',
    """
<div class="wb">
  <blockquote>A case that holds only while its author is in the room is not yet a case. It is a performance.</blockquote>
  <div class="two">
    <p><b>So I built the standard into a system.</b> LVRF holds every claim to its evidence, so a case stands up in the rooms its author never enters.</p>
    <p><b>And it asks the harder question.</b> Once the money is spent, did the value happen? It answers from the customer’s own records, or says plainly that it can’t yet.</p>
  </div>
</div>""",
    f'{BOOK}, chapter 16, “The Defend-Without-Me Standard”; LVRF working constitution.',
    """
.wb { width: 100%; display: flex; flex-direction: column; gap: 44px; }
.wb blockquote { font-family: 'Bebas Neue'; font-size: 58px; line-height: 1.02; color: var(--offwhite); border-left: 5px solid var(--gold); padding-left: 32px; max-width: 26ch; }
.wb .two { display: grid; grid-template-columns: 1fr 1fr; gap: 72px; }
.wb .two p { font-size: 25px; line-height: 1.45; font-weight: 300; color: var(--silver); }
.wb .two b { display: block; color: var(--gold); font-weight: 600; font-family: 'Barlow Condensed'; font-size: 24px; margin-bottom: 6px; }
""")

# ── 00d How Rule 76 applies to LVRF ────────────────────────────────────────────
cards['00d-rule76-lvrf'] = page(
    'One philosophy. One record.',
    'The whole ship pointed one way.',
    """
<div class="tm3">
  <div class="mo"><div class="k">The philosophy</div><h4>Rule 76</h4><p>Every claim attached to its evidence. A person decides, by name. Nothing is edited after the fact.</p></div>
  <div class="mo"><div class="k">The system</div><h4>LVRF</h4><p>The philosophy built into every account: the same spine, the same rules, enforced by the database rather than by memory.</p></div>
  <div class="mo g"><div class="k">The result</div><h4>Real cases</h4><p>Business value cases you can act on today, refused where the evidence isn’t there yet, with the asks that close the gap.</p></div>
  <div class="gov"><p>Sales, value engineering, customer success and finance, all working from the same record and the same standard.</p></div>
</div>""",
    f'{BOOK}; LVRF working constitution and its governing AI principle.',
    """
.tm3 { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 34px 48px; align-content: start; }
.mo { border-top: 3px solid var(--ink-45); padding-top: 18px; }
.mo.g { border-top-color: var(--gold); }
.mo .k { font-family: 'Barlow Condensed'; font-size: 20px; color: var(--silver); margin-bottom: 6px; }
.mo h4 { font-family: 'Bebas Neue'; font-weight: 400; font-size: 72px; line-height: .9; margin-bottom: 14px; color: var(--offwhite); }
.mo.g h4 { color: var(--gold); }
.mo p { font-size: 22px; line-height: 1.45; font-weight: 300; }
.gov { grid-column: 1 / -1; border-left: 4px solid var(--gold); padding-left: 26px; }
.gov p { font-size: 25px; line-height: 1.45; }
""")

# ── 00e Legacy ─────────────────────────────────────────────────────────────────
cards['00e-legacy'] = page(
    'Point the ship where you want it to go.',
    'Leave a legacy that endures.',
    """
<div class="lg">
  <div class="pts3">
    <p>Align the whole organization around one philosophy, and around real business value cases it can act on today.</p>
    <p>Every account team brings a case its customer’s CFO can defend, without anyone from Skillsoft in the room.</p>
    <p>Every result is kept, sourced and sealed, so the next team inherits proof, not anecdotes. That outlasts every renewal.</p>
  </div>
  <div class="ask">What principles will govern us when the people who created us are no longer here?</div>
</div>""",
    f'The question is the one {BOOK} opens with.',
    """
.lg { width: 100%; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 28px; }
.pts3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 48px; }
.pts3 p { font-size: 28px; line-height: 1.45; font-weight: 300; border-top: 3px solid var(--gold); padding-top: 18px; }
.ask { font-family: 'Barlow'; font-style: italic; font-size: 34px; line-height: 1.35; color: var(--gold); max-width: 50ch; }
""")

# ── The challenge (before the walkthrough, and again at the close) ─────────────
def challenge(w, g, lead):
    return page(w, g, f"""
<div class="ch">
  <p class="lead2">{e(lead)}</p>
  <div class="three">
    <div><span>What</span>you sell them.</div>
    <div><span>Who</span>you sell it to.</div>
    <div><span>Why</span>Skillsoft, and why now.</div>
  </div>
</div>""",
    'Built from published sources the way every LVRF case starts: every figure with its basis, and marked outside-in until the customer confirms it.',
    """
.ch { width: 100%; display: flex; flex-direction: column; gap: 52px; padding-top: 8px; }
.ch .lead2 { font-size: 36px; line-height: 1.35; font-weight: 300; }
.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 40px; }
.three div { font-size: 36px; line-height: 1.25; border-top: 3px solid var(--gold); padding-top: 18px; }
.three span { display: block; font-family: 'Bebas Neue'; font-size: 132px; line-height: .9; color: var(--gold); margin-bottom: 6px; }
""")

cards['08b-challenge'] = challenge(
    'This is what I can do for every one',
    'of your planned target opportunities, right now.',
    'Give me the name of one account, and I will tell you:')
cards['11-challenge-close'] = challenge(
    'One account. That’s all it takes.',
    'Name it, and I’ll show you.',
    'Send me the name of one of your target accounts, and I will tell you:')

# Headlines that would run to three lines at the default size.
SIZES = {'00a-matt': 72, '00c-why-built': 70, '00d-rule76-lvrf': 70, '08b-challenge': 72}
for _n, _px in SIZES.items():
    cards[_n] = cards[_n].replace('<h1>', f'<h1 style="font-size:{_px}px">', 1)

for name, doc in cards.items():
    (HERE / f'{name}.html').write_text(doc)

async def render():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        chrome = os.environ.get('CHROME', '/usr/bin/google-chrome')
        b = await (p.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else p.chromium.launch(channel='chrome'))
        pg = await b.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=2)
        for name in cards:
            await pg.goto((HERE / f'{name}.html').as_uri())
            await pg.evaluate('document.fonts.ready')
            # Fail loudly if anything overflows the card.
            over = await pg.evaluate("""() => {
              const b = document.querySelector('.body');
              return [...b.querySelectorAll('*')].filter(el => { const r = el.getBoundingClientRect(); const B = b.getBoundingClientRect();
                return r.bottom > B.bottom + 1 || r.right > B.right + 1; }).length; }""")
            if over: print(f'  ! {name}: {over} elements overflow')
            await pg.screenshot(path=str(OUT / f'{name}.png'))
            print('rendered', name)
        await b.close()

asyncio.run(render())

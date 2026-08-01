#!/usr/bin/env python3
"""
LVRF — Realization Record renderer

    python3 render_record.py

Reads out/spine_run.json + customer_zero.json, emits the Rule76 PDF.
Design tokens are cited from CLAUDE.md, not reinvented here.
Flexbox and tables only — CSS Grid is unreliable in WeasyPrint.
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timezone

try:
    from weasyprint import HTML
except (ImportError, OSError) as exc:
    # OSError, not just ImportError: WeasyPrint imports but fails to load its
    # native libraries under macOS system Python, because SIP strips DYLD_* env
    # vars before the interpreter starts. No library path can fix that — the
    # interpreter has to change. See records/ENVIRONMENT.md.
    raise SystemExit(
        f"\nWeasyPrint unavailable under {sys.executable}\n"
        f"  {type(exc).__name__}: {exc}\n\n"
        "This is almost always the wrong interpreter rather than a missing package.\n"
        "macOS system Python cannot run WeasyPrint's native bindings.\n\n"
        "  npm run record:render -- <fixture.json>\n"
        "  /opt/homebrew/bin/python3 records/render_record.py <fixture.json>\n\n"
        "Setup and the reasoning behind it: records/ENVIRONMENT.md\n") from exc

HERE = Path(__file__).parent
OUT = HERE / "out"

INK, GOLD, SILVER, OFFWHITE = "#09090A", "#C9A24A", "#C0C0C0", "#FAFAFA"

CSS = f"""
@page {{
  size: letter; margin: 0.8in 0.85in 0.9in 0.85in;
  @bottom-left {{ content: "Rule76 · LVRF Realization Record · Customer Zero";
    font-family: Barlow; font-size: 7pt; color: #8A8A8A; letter-spacing: .04em; }}
  @bottom-right {{ content: counter(page) " / " counter(pages);
    font-family: Barlow; font-size: 7pt; color: #8A8A8A; }}
}}
html {{ font-size: 9.6pt; }}
body {{ font-family: Barlow, sans-serif; color: {INK}; line-height: 1.46; }}
.mark {{ font-family: "Bebas Neue"; font-size: 14pt; letter-spacing: .16em; margin: 0 0 1pt; }}
.mark span {{ color: {GOLD}; }}
.kicker {{ font-size: 7pt; letter-spacing: .18em; text-transform: uppercase;
  color: #8A8A8A; margin: 0 0 14pt; }}
h1 {{ font-family: "Bebas Neue"; font-size: 27pt; line-height: 1.03;
  letter-spacing: .012em; margin: 0 0 5pt; }}
.deck {{ font-size: 10.5pt; color: #3A3A3C; margin: 0 0 14pt; max-width: 5.3in; }}
h2 {{ font-family: "Bebas Neue"; font-size: 14pt; letter-spacing: .05em;
  margin: 19pt 0 3pt; padding-bottom: 3pt; border-bottom: .6pt solid #D8D8D8; }}
h2 .n {{ color: {GOLD}; margin-right: 6pt; }}
p {{ margin: 0 0 7pt; }}

.banner {{ border: 1.4pt solid {INK}; padding: 9pt 11pt; margin: 0 0 14pt; }}
.banner .t {{ font-family: "Bebas Neue"; font-size: 13pt; letter-spacing: .09em;
  margin: 0 0 3pt; }}
.banner p {{ font-size: 8.5pt; margin: 0; color: #3A3A3C; }}
.banner.gate {{ border-color: {GOLD}; background: {OFFWHITE}; }}
.banner.gate .t {{ color: {GOLD}; }}

table {{ width: 100%; border-collapse: collapse; font-size: 8.6pt; margin: 5pt 0 9pt; }}
th {{ text-align: left; font-size: 6.8pt; letter-spacing: .12em; text-transform: uppercase;
  color: #8A8A8A; padding: 0 7pt 4pt 0; border-bottom: .6pt solid {SILVER}; }}
td {{ padding: 5pt 7pt 5pt 0; border-bottom: .5pt solid #EAEAEA; vertical-align: top; }}
td.f {{ font-weight: 600; white-space: nowrap; }}
td.s {{ font-size: 7.2pt; color: #8A8A8A; }}
.tag {{ font-size: 6.6pt; letter-spacing: .1em; text-transform: uppercase;
  padding: 1pt 4pt; border: .5pt solid {SILVER}; color: #5A5A5A; white-space: nowrap; }}
.tag.sim {{ border-color: {INK}; color: {INK}; font-weight: 600; }}
.tag.ok {{ border-color: {GOLD}; color: {GOLD}; }}

.hero {{ display: flex; gap: 10pt; margin: 6pt 0 12pt; }}
.hero .c {{ flex: 1; border-top: 1.6pt solid {GOLD}; padding-top: 6pt; }}
.hero .l {{ font-size: 6.6pt; letter-spacing: .13em; text-transform: uppercase;
  color: #8A8A8A; margin: 0 0 2pt; }}
.hero .v {{ font-family: "Bebas Neue"; font-size: 21pt; line-height: 1; margin: 0; }}
.hero .u {{ font-size: 7.2pt; color: #8A8A8A; margin: 2pt 0 0; }}

.note {{ background: {OFFWHITE}; border: .6pt solid #E2E2E2; padding: 8pt 10pt;
  margin: 9pt 0; font-size: 8.2pt; color: #3A3A3C; }}
.note .t {{ font-family: "Bebas Neue"; font-size: 9.5pt; letter-spacing: .1em;
  color: {GOLD}; display: block; margin-bottom: 2pt; }}
.avoid {{ page-break-inside: avoid; }}
.mono {{ font-family: ui-monospace, "DejaVu Sans Mono", monospace; font-size: 7.4pt; }}
"""


def tag(txt, cls=""):
    return f'<span class="tag {cls}">{txt}</span>'


def build(fx, run):
    d, h = run["delta"], run["health"]
    c0 = run["confidence"]
    vo, bm = fx["value_outcome"], fx["business_metric"]
    verified = run["realization"] == "verified"
    cap = fx["capability"]
    inst = fx["institution"]
    zero_badge = tag('CUSTOMER ZERO','ok') if inst.get("is_tenant_self") else tag(inst.get('industry','')[:34])

    # ---- banners: provenance note, then the gate in its actual state ----
    prov = f"""
    <div class="banner">
      <p class="t">{fx['run'].get('banner_title','PROVENANCE')}</p>
      <p>{fx['run']['note']}</p>
    </div>"""

    if verified:
        gate = f"""
    <div class="banner gate">
      <p class="t">DISCLOSURE GATE — CLEARED FOR {run['disclosure'].replace('_',' ').upper()}</p>
      <p>Realization is <strong>VERIFIED</strong>. Evidence on both sides of the delta was
      confirmed by an authority over the source, and
      <strong>{fx['persons']['verifier']['name']}, {fx['persons']['verifier']['title']}</strong>
      is the verifier of record. Computed confidence is
      <strong>{c0['score']:g}/100 ({c0['band'].upper()})</strong> — attested evidence earns
      partial credit, so a record of this shape cannot exceed 80 without independent
      verification. That ceiling is deliberate.</p>
    </div>"""
    else:
        gate = f"""
    <div class="banner gate">
      <p class="t">DISCLOSURE GATE — {run['disclosure'].replace('_',' ').upper()}</p>
      <p>Realization status is <strong>{run['realization'].upper()}</strong>, not verified.
      Evidence supporting the measured actual is not confirmed by an authority over its
      source, and no named human verifier is of record.
      <strong>This record may not be released to a customer.</strong> The schema constraint
      <span class="mono">value_outcomes_verified_requires_human</span> would reject an
      attempt to force verification.</p>
    </div>"""
    banners = prov + gate

    # ---- hero ----
    def sim_tag(flag):
        return "simulated" if flag else "attested"
    unit = "" if len(bm['unit']) > 4 else bm['unit']
    hero = f"""
    <div class="hero">
      <div class="c"><p class="l">Baseline</p><p class="v">{vo['baseline_value']}{unit}</p>
        <p class="u">{vo['baseline_measured_at']} · {sim_tag(not vo.get('baseline_sourced'))}</p></div>
      <div class="c"><p class="l">Target</p><p class="v">{vo['target_value']}{unit}</p>
        <p class="u">committed · {sim_tag(vo.get('target_simulated'))}</p></div>
      <div class="c"><p class="l">Measured</p><p class="v">{vo['actual_value']}{unit}</p>
        <p class="u">{vo['actual_measured_at']} · {sim_tag(vo.get('actual_simulated'))}</p></div>
      <div class="c"><p class="l">Delta</p><p class="v">{d['raw']:+}</p>
        <p class="u">{d['pct_of_target']}% of target · {bm['direction']} is better</p></div>
    </div>"""

    # ---- evidence ----
    ev_rows = ""
    for e in fx["evidence"]:
        badges = tag("SIM", "sim") if e["simulated"] else tag("SOURCED", "ok")
        ver = tag("VERIFIED", "ok") if e["source_verified"] else tag("UNVERIFIED")
        ev_rows += f"""<tr>
          <td class="s">{e['supports']}</td>
          <td>{e['summary']}</td>
          <td class="s">{e['provenance']}</td>
          <td>{badges} {ver}</td></tr>"""

    # ---- heartbeats ----
    hb_rows = "".join(
        f"""<tr><td class="f">{e['heartbeatId']}</td><td>{e['eventType']}</td>
        <td class="s">{e['valueStage']}</td><td class="s">{e['category']}</td>
        <td class="s">{e['producer']}</td>
        <td>{tag(e['healthState'].upper(), 'ok' if e['healthState']=='healthy' else '')}</td>
        <td class="mono">{e['contentHash'][:12]}</td></tr>"""
        for e in run["events"])

    # ---- health ----
    hd_rows = ""
    for dim in h["dimensions"]:
        score = ("<em>UNMEASURED</em>" if dim["score"] is None
                 else f"<strong>{dim['score']}</strong>")
        n = dim.get("events", 0)
        hd_rows += (f"<tr><td>{dim['dimension']}</td><td class=\"s\">{dim['weight']}%</td>"
                    f"<td>{score}</td><td class=\"s\">{n or '—'}</td></tr>")

    # ---- findings ----
    f_rows = "".join(
        f"""<tr><td class="f">{c}</td><td>{tag(s.upper())}</td><td>{m}</td></tr>"""
        for c, s, m in run["findings"])

    c = run["confidence"]
    c_rows = ""
    for f in c["factors"]:
        pct = f["earned"] / f["weight"] if f["weight"] else 0
        cls = "ok" if pct >= 0.99 else ("" if pct > 0 else "sim")
        c_rows += (f"""<tr><td class="s">{f['question']}</td>
          <td class="f">{f['earned']:g} / {f['weight']}</td>
          <td>{tag('FULL' if pct>=0.99 else ('PARTIAL' if pct>0 else 'ZERO'), cls)}</td>
          <td class="s">{f['note']}</td></tr>""")

    sr = fx["stewardship_return"]

    return f"""<!DOCTYPE html><html><head><meta charset="utf-8">
    <style>{CSS}</style></head><body>

    <p class="mark">RULE<span>76</span></p>
    <p class="kicker">LVRF · Realization Record · v1</p>

    <h1>{cap['name']}<br>{bm['name']}</h1>
    <p class="deck">{fx['run'].get('deck', 'A single capability, attached to one business metric the institution already reports, walked through all seven stages of the value spine.')}</p>

    {banners}

    <table>
      <tr><th>Tenant</th><th>Institution</th><th>Engagement</th><th>Value engineer</th><th>Renewal</th></tr>
      <tr><td class="f">{fx['tenant']['id']}</td>
          <td class="f">{inst['name']} {zero_badge}</td>
          <td>{fx['engagement']['name']}</td>
          <td>{fx['persons']['value_engineer']['name']}</td>
          <td class="s">{fx['engagement'].get('renewal_date','—')}</td></tr>
    </table>

    <h2><span class="n">01</span>The Metric</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Value</th></tr>
      <tr><td class="s">Name</td><td class="f">{bm['name']}</td></tr>
      <tr><td class="s">Unit / direction</td><td>{bm['unit']} · higher is better</td></tr>
      <tr><td class="s">Source system</td><td>{bm['source_system']}</td></tr>
      <tr><td class="s">Cadence</td><td>{bm['reporting_cadence']}</td></tr>
      <tr><td class="s">Definition</td><td>{bm['definition_notes']}</td></tr>
    </table>
    <p>The metric is not one LVRF invented. It is the number the institution has already
    asked the market to judge it by, which is the whole basis of the record's
    defensibility.</p>

    <h2><span class="n">02</span>Baseline, Target, Measured</h2>
    {hero}
    <table>
      <tr><th style="width:24%">Currency</th><th style="width:24%">Amount</th><th>Derived from</th></tr>
      <tr><td class="s">Claimed at commit</td>
          <td class="f">{vo['currency_code']} {vo['claimed_currency_impact']:,.0f}</td>
          <td class="s">The committed target of {vo['target_value']}</td></tr>
      <tr><td class="s">Realized at measure</td>
          <td class="f">{vo['currency_code']} {vo['realized_currency_impact']:,.0f}</td>
          <td class="s">The measured actual of {vo['actual_value']}</td></tr>
      <tr><td class="s">Confirmation gap</td>
          <td class="f">{d['currency']['gap']:+,.0f}</td>
          <td class="s">{d['currency']['share_of_claim']:.1%} of claim
          {'· delivered above claim' if d['currency']['share_of_claim'] >= 1 else '· delivered below claim'}</td></tr>
      <tr><td class="s">Measured on time</td>
          <td class="f">{'yes' if d.get('on_time') else 'no'}</td>
          <td class="s">{d.get('punctuality_days', 0):+} day(s) against a promise of
          {vo.get('promised_measured_at','—')}</td></tr>
    </table>
    <div class="note">
      <span class="t">BASIS — {'INFERENCE, NOT DISCLOSURE' if vo.get('impact_is_inference', True) else 'ATTESTED'}</span>
      {vo['impact_basis']}
      <br><br><strong>Claimed and realized are separate figures, deliberately.</strong> A
      single currency column would be overwritten at measurement with the outcome, erasing
      the only evidence the claim was ever wrong — which is precisely the record a finance
      function wants to see. The schema refuses either figure without a stated basis
      (<span class="mono">value_outcomes_impact_requires_basis</span>) and refuses a realized
      figure before a measurement exists
      (<span class="mono">value_outcomes_realized_requires_measurement</span>).
    </div>

    <h2><span class="n">03</span>The Capability</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Value</th></tr>
      <tr><td class="s">Capability</td><td class="f">{fx['capability']['name']}</td></tr>
      <tr><td class="s">Role family</td><td>{fx['capability']['role_family']}</td></tr>
      <tr><td class="s">Definition</td><td>{fx['capability']['description']}</td></tr>
      <tr><td class="s">Assessed movement</td>
          <td>{fx['assessment']['prior_score']} → {fx['assessment']['score']}
          of {fx['assessment']['scale_max']}
          {tag('SIM','sim') if fx['assessment'].get('simulated') else ''}
          {('· ' + str(fx['assessment']['population']) + ' assessed') if fx['assessment'].get('population') else ''}</td></tr>
    </table>
    <p>Learning is the mechanism, not the claim. Per AMENDMENT-001 Article II the
    assessment exists to evidence that capability moved — it is not itself the value.</p>

    <h2><span class="n">04</span>Evidence Ledger</h2>
    <table>
      <tr><th style="width:11%">Supports</th><th style="width:31%">Summary</th>
          <th style="width:34%">Provenance</th><th>State</th></tr>
      {ev_rows}
    </table>

    <h2><span class="n">05</span>Heartbeat Ledger</h2>
    <p>Ten events, every one registered. An unregistered heartbeat is refused by the
    foreign key to <span class="mono">heartbeats</span> — HEARTBEAT-REGISTER §1 enforced
    structurally rather than documentarily.</p>
    <table>
      <tr><th>ID</th><th>Event</th><th>Stage</th><th>Category</th><th>Producer</th>
          <th>State</th><th>Hash</th></tr>
      {hb_rows}
    </table>

    <h2><span class="n">06</span>Institutional Health</h2>
    <table>
      <tr><th style="width:42%">Dimension</th><th>Weight</th><th>Score</th><th>Events</th></tr>
      {hd_rows}
      <tr><td class="f">COMPOSITE</td><td class="s">{h['coverage_pct']}% covered</td>
          <td class="f">{h['composite']} &nbsp; {tag(h['band'])}</td><td></td></tr>
    </table>
    <div class="note">
      <span class="t">WHY THIS IS NOT 100</span>
      {h['basis']}<br><br>Security is reported UNMEASURED rather than scored — no security
      heartbeat fired in this run. Per AMENDMENT-001 Article VII, a dimension with nothing
      executed against it cannot be asserted as compliant. The composite sits in WATCH
      because verification was refused, not because the mechanism failed. Financial /
      Value Realization is the seventh dimension established by AMENDMENT-003, weighted at
      10 rather than 20: institutional health measures faithfulness, not performance.
    </div>

    <h2><span class="n">07</span>Findings</h2>
    <table>
      <tr><th style="width:8%">Code</th><th style="width:13%">Severity</th><th>Finding</th></tr>
      {f_rows}
    </table>

    <h2><span class="n">08</span>Confidence Ledger</h2>
    <p>Confidence is <strong>computed from the evidence ledger, not asserted.</strong> A
    value engineer able to type "high" would eventually type it under pressure. The six
    factors below are the questions a finance function actually asks, weighted by how badly
    a negative answer damages the record.</p>
    <table>
      <tr><th style="width:30%">Factor</th><th style="width:11%">Earned</th>
          <th style="width:11%">State</th><th>Basis</th></tr>
      {c_rows}
      <tr><td class="f">COMPUTED CONFIDENCE</td>
          <td class="f">{c['score']:g} / 100</td>
          <td>{tag(c['band'].upper(), 'sim' if c['band']=='low' else 'ok')}</td>
          <td class="s">{c['method']}</td></tr>
    </table>
    <div class="note">
      <span class="t">WHAT THE MISSING {100 - c['score']:g} POINTS ARE</span>
      This is not a grade. It is a work list, and every lost point names a specific,
      obtainable input: the metric's calculation method (20), source-verified evidence for
      the measured actual (25), an evidenced rather than inferred impact basis (5), a named
      human sponsor of record (10), and a named human verifier of record (10).<br><br>
      A record at {c['score']:g}/100 is not defensible to a finance function, and this
      document says so on its own face rather than leaving a reader to discover it.
    </div>

    <h2><span class="n">09</span>Return to the Cathedral</h2>
    <table>
      <tr><th style="width:22%">Field</th><th>Value</th></tr>
      <tr><td class="s">Kind</td><td class="f">{sr['kind'].replace('_',' ')}</td></tr>
      <tr><td class="s">Pattern</td><td>{sr['summary']}</td></tr>
      <tr><td class="s">Narrative</td><td>{sr['narrative']}</td></tr>
      <tr><td class="s">Target</td><td>{sr['target_chapel']}</td></tr>
    </table>
    <p>The spine's terminal stage is a write, not a label. This is the mechanism by which
    the finding compounds institutionally rather than ending at the engagement.</p>

    <div class="note avoid">
      <span class="t">RECORD INTEGRITY</span>
      Content hash <span class="mono">{run['record_hash']}</span><br>
      Document version 1 · Contract version {fx['run']['contract_version']} ·
      Rendered {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M UTC')}<br><br>
      Every rendering is logged with a SHA-256 over the payload that produced it, so any
      document in a customer's hands traces to the exact data behind it. Corrections
      create a new version; they never overwrite one.
    </div>

    </body></html>"""


def main():
    fixture = sys.argv[1] if len(sys.argv) > 1 else "customer_zero.json"
    stem = Path(fixture).stem
    fx = json.loads((HERE / fixture).read_text())

    run_path = OUT / f"spine_run_{stem}.json"
    if not run_path.exists():
        raise SystemExit(
            f"No spine run for '{stem}'. Expected {run_path.name}.\n"
            f"Run:  python3 simulate_spine.py {fixture}\n"
            f"Refusing to render — a document built from another fixture's run "
            f"would carry the wrong numbers without saying so.")
    run = json.loads(run_path.read_text())

    if run.get("source_fixture") not in (None, stem):
        raise SystemExit(
            f"Run/fixture mismatch: {run_path.name} was produced from "
            f"'{run['source_fixture']}', not '{stem}'. Refusing to render.")

    html = build(fx, run)
    (OUT / f"realization_record_{stem}.html").write_text(html)
    pdf = OUT / f"LVRF_Realization_Record_{stem.replace('_','-')}.pdf"
    HTML(string=html, base_url=str(HERE)).write_pdf(pdf)
    print(f"rendered -> {pdf}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
LVRF — Confirmation Gap Engine

    python3 confirmation_gap.py out/spine_run_*.json

Constitutional basis: AMENDMENT-001 Article II assigns LVRF ownership of
Confirmation Gap. Nothing computed it until now.

── What this measures, and why it is portfolio-level ──────────────────────

A single outcome's target-versus-actual is arithmetic; anyone can do it and
nobody should be impressed. The question a finance function actually asks is
different:

    "When this function tells me a number, how wrong is it usually,
     and in which direction?"

That is a property of a BODY of records, not of one. So the engine computes
per-outcome variance for transparency, and its actual output is the portfolio
statistic — with **direction weighted above magnitude.**

A function consistently 10% conservative is trustworthy. A function
consistently 10% optimistic is not, at identical absolute error. Optimistic
bias is the failure this instrument exists to detect, because it is the failure
that destroys a value engineering practice.

── Refusal ────────────────────────────────────────────────────────────────

Below MIN_POPULATION the engine reports individual gaps and **declines to state
a portfolio bias.** Two records are not a trend. This is the same discipline as
the health model reporting UNMEASURED rather than assuming compliance.
"""

import json
import sys
import statistics
from pathlib import Path

HERE = Path(__file__).parent

# Below this, no portfolio statistic is reported. Five is the point at which a
# mean signed variance carries any information at all; it is still small.
MIN_POPULATION = 5
# Above this, dispersion is meaningful enough to characterise.
DISPERSION_POPULATION = 12

# A claim is "confirmed" if the actual reached the target, direction-aware.
# Bias bands are on the share of the PROMISED improvement actually delivered.
BIAS_BANDS = [
    (1.00, "conservative", "Delivered at or above claim. Claims are safe to rely on."),
    (0.90, "calibrated", "Within 10% of claim. Normal estimation error."),
    (0.70, "optimistic", "Delivering 70-90% of claim. Claims need discounting."),
    (0.00, "materially optimistic",
     "Delivering under 70% of claim. The practice is over-claiming and its "
     "output should not be relied on without correction."),
]


def outcome_gap(fx, run):
    """Per-outcome confirmation gap. Direction-aware."""
    vo, bm = fx["value_outcome"], fx["business_metric"]
    base = vo["baseline_value"]
    tgt = vo.get("target_value")
    act = vo.get("actual_value")
    decreasing = bm["direction"] == "decrease"

    g = {
        "institution": fx["institution"]["name"],
        "metric": bm["name"],
        "capability": fx["capability"]["name"],
        "realization": run["realization"],
        "confidence": run["confidence"]["score"],
        "direction": bm["direction"],
        "baseline": base, "target": tgt, "actual": act,
    }

    if tgt is None or act is None:
        g["measurable"] = False
        g["reason"] = ("No target or no measured actual. A claim that was never "
                       "measured cannot be confirmed or refuted — it is simply open.")
        return g

    promised = (base - tgt) if decreasing else (tgt - base)
    delivered = (base - act) if decreasing else (act - base)

    # Currency and punctuality are computed in the spine run; carried, not
    # recomputed, so there is one source of arithmetic.
    dl = run.get("delta", {})
    g["currency"] = dl.get("currency", {})
    g["punctuality_days"] = dl.get("punctuality_days")
    g["on_time"] = dl.get("on_time")

    g["measurable"] = True
    g["promised_improvement"] = round(promised, 4)
    g["delivered_improvement"] = round(delivered, 4)
    g["gap"] = round(delivered - promised, 4)
    g["delivered_share"] = round(delivered / promised, 4) if promised else None
    g["confirmed"] = (act <= tgt) if decreasing else (act >= tgt)

    # A confirmed outcome whose evidence is unverified is not a confirmation.
    # It is an unconfirmed claim that happens to look good.
    g["evidence_admissible"] = run["realization"] in ("verified",)
    g["admissible"] = g["confirmed"] and g["evidence_admissible"]
    return g


def portfolio(gaps):
    """Portfolio statistics, or an explicit refusal."""
    admissible = [g for g in gaps if g.get("measurable") and g["evidence_admissible"]]
    n = len(admissible)

    out = {
        "population_total": len(gaps),
        "population_admissible": n,
        "excluded": [
            {"institution": g["institution"], "reason":
             g.get("reason", f"realization is '{g['realization']}', not verified")}
            for g in gaps if g not in admissible
        ],
    }

    if n < MIN_POPULATION:
        out["reported"] = False
        out["refusal"] = (
            f"Portfolio bias NOT reported. {n} admissible outcome(s) against a "
            f"minimum of {MIN_POPULATION}. A mean signed variance over this "
            f"population would be arithmetic without being information, and "
            f"publishing it would invite exactly the false confidence this "
            f"instrument exists to prevent."
        )
        return out

    shares = [g["delivered_share"] for g in admissible if g["delivered_share"] is not None]
    out["reported"] = True

    # Currency bias — the figure a finance function actually asks for. Only
    # computable because claimed and realized are separate columns.
    cshares = [g["currency"]["share_of_claim"] for g in admissible
               if g.get("currency", {}).get("share_of_claim") is not None]
    if cshares:
        cmean = statistics.fmean(cshares)
        out["currency_population"] = len(cshares)
        out["mean_currency_share"] = round(cmean, 4)
        out["currency_bias_band"], out["currency_bias_note"] = next(
            (name, note) for thr, name, note in BIAS_BANDS if cmean >= thr)
    else:
        out["currency_population"] = 0
        out["mean_currency_share"] = None

    # Punctuality — delivering LATE is a distinct failure from delivering SHORT.
    late = [g["punctuality_days"] for g in admissible if g.get("punctuality_days") is not None]
    if late:
        out["punctuality_population"] = len(late)
        out["mean_slippage_days"] = round(statistics.fmean(late), 1)
        out["on_time_rate"] = round(sum(1 for d in late if d <= 0) / len(late), 4)
    else:
        out["punctuality_population"] = 0
    out["confirmation_rate"] = round(sum(1 for g in admissible if g["confirmed"]) / n, 4)
    mean_share = statistics.fmean(shares)
    out["mean_delivered_share"] = round(mean_share, 4)
    out["bias_band"], out["bias_note"] = next(
        (name, note) for thr, name, note in BIAS_BANDS if mean_share >= thr)

    if n >= DISPERSION_POPULATION:
        out["dispersion_sd"] = round(statistics.stdev(shares), 4)
        out["dispersion_reported"] = True
    else:
        out["dispersion_reported"] = False
        out["dispersion_note"] = (
            f"Dispersion not reported — {n} outcomes against a minimum of "
            f"{DISPERSION_POPULATION}. Central tendency is stated; spread is not.")
    return out


# ── Schema gaps this engine cannot work around ────────────────────────────
# Both gaps recorded here on 29 July were closed by migration 0001. Kept as a
# record of what the engine could not do before the schema supported it.
SCHEMA_GAPS = []
CLOSED_GAPS = [
    ("currency confirmation",
     "CLOSED by 0001. `claimed_currency_impact` and `realized_currency_impact` are "
     "separate columns, so the dollar variance is computable. A single column "
     "overwrote the claim with the outcome and erased the only evidence the claim "
     "was ever wrong."),
    ("measurement punctuality",
     "CLOSED by 0001. `promised_measured_at` distinguishes a practice that delivers "
     "LATE from one that delivers SHORT."),
]


def main():
    args = sys.argv[1:] or sorted(str(p) for p in (HERE / "out").glob("spine_run_*.json"))
    if not args:
        print("no spine runs found"); return

    gaps = []
    for path in args:
        run = json.loads(Path(path).read_text())
        stem = Path(path).stem.replace("spine_run_", "")
        fx_path = HERE / f"{stem}.json"
        if not fx_path.exists():
            print(f"  skip {stem}: no matching fixture"); continue
        gaps.append(outcome_gap(json.loads(fx_path.read_text()), run))

    p = portfolio(gaps)

    print("\n" + "=" * 78)
    print("LVRF CONFIRMATION GAP")
    print("=" * 78)

    print(f"\nPer-outcome ({len(gaps)})")
    print("-" * 78)
    for g in gaps:
        print(f"\n  {g['institution']} — {g['capability']}")
        print(f"    metric        {g['metric']} ({g['direction']})")
        if not g["measurable"]:
            print(f"    NOT MEASURABLE  {g['reason']}")
            continue
        print(f"    baseline      {g['baseline']}  ->  target {g['target']}  ->  actual {g['actual']}")
        print(f"    promised      {g['promised_improvement']:+}")
        print(f"    delivered     {g['delivered_improvement']:+}")
        print(f"    gap           {g['gap']:+}   ({g['delivered_share']:.1%} of claim)")
        cur = g.get("currency", {})
        if cur.get("share_of_claim") is not None:
            print(f"    currency      ${cur['claimed']:,.0f} claimed -> "
                  f"${cur['realized']:,.0f} realized   "
                  f"({cur['share_of_claim']:.1%}, {cur['gap']:+,.0f})")
        if g.get("punctuality_days") is not None:
            print(f"    punctuality   {g['punctuality_days']:+} day(s)"
                  f"{'' if g['on_time'] else '   <- LATE'}")
        print(f"    confirmed     {g['confirmed']}")
        print(f"    admissible    {g['admissible']}"
              f"{'' if g['evidence_admissible'] else '   <- realization not verified'}")

    print(f"\n\nPortfolio")
    print("-" * 78)
    print(f"  total outcomes        {p['population_total']}")
    print(f"  admissible            {p['population_admissible']}")
    if p["excluded"]:
        print(f"  excluded:")
        for e in p["excluded"]:
            print(f"    - {e['institution']}: {e['reason']}")

    if not p["reported"]:
        print(f"\n  BIAS NOT REPORTED")
        for line in _wrap(p["refusal"], 72):
            print(f"    {line}")
    else:
        print(f"\n  confirmation rate     {p['confirmation_rate']:.1%}")
        print(f"  mean delivered share  {p['mean_delivered_share']:.1%}")
        print(f"  BIAS BAND             {p['bias_band'].upper()}")
        for line in _wrap(p["bias_note"], 72):
            print(f"    {line}")
        if p.get("mean_currency_share") is not None:
            print(f"\n  mean currency share   {p['mean_currency_share']:.1%}"
                  f"   (n={p['currency_population']})")
            print(f"  CURRENCY BIAS         {p['currency_bias_band'].upper()}")
            for line in _wrap(p["currency_bias_note"], 72):
                print(f"    {line}")
        if p.get("punctuality_population"):
            print(f"\n  on-time rate          {p['on_time_rate']:.1%}")
            print(f"  mean slippage         {p['mean_slippage_days']:+} day(s)")
        if p["dispersion_reported"]:
            print(f"  dispersion (sd)       {p['dispersion_sd']:.3f}")
        else:
            for line in _wrap(p["dispersion_note"], 72):
                print(f"    {line}")

    if SCHEMA_GAPS:
        print(f"\n\nSchema gaps blocking full computation ({len(SCHEMA_GAPS)})")
        print("-" * 78)
        for name, detail in SCHEMA_GAPS:
            print(f"\n  {name.upper()}")
            for line in _wrap(detail, 72):
                print(f"    {line}")
    else:
        print(f"\n\nSchema gaps: none. {len(CLOSED_GAPS)} closed by migration 0001.")
        print("-" * 78)
        for name, detail in CLOSED_GAPS:
            print(f"  {name} — {detail.split('.')[0]}.")

    (HERE / "out" / "confirmation_gap.json").write_text(
        json.dumps({"outcomes": gaps, "portfolio": p,
                    "schema_gaps": [{"name": n, "detail": d} for n, d in SCHEMA_GAPS],
                    "closed_gaps": [{"name": n, "detail": d} for n, d in CLOSED_GAPS]},
                   indent=2))
    print(f"\n\nwritten -> out/confirmation_gap.json\n")


def _wrap(text, width):
    words, line, out = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > width:
            out.append(line); line = w
        else:
            line = f"{line} {w}".strip()
    if line: out.append(line)
    return out


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
LVRF — Value Spine Simulator

Walks all seven stages of the value spine for a single engagement, emitting
register-compliant heartbeat events, computing institutional health, and
rendering the Realization Record.

    python3 simulate_spine.py customer_zero.json

Constitutional basis:
  HEARTBEAT-REGISTER (R76-HB-001) §9 severity, §10 register, §11 event contract
  COMPASS-HEARTBEAT-STATUS (R76-HB-002) §7 health model, §8 health states
  AMENDMENT-001 (R76-AMD-001) vendor-facing reorientation
  AMENDMENT-002 (R76-AMD-002) HB-0013..HB-0018 Value Realization family

This runs against a JSON fixture rather than Postgres so the spine can be
exercised before the API exists. Field names map 1:1 to db/schema.ts; wiring it
to the database is a substitution of the loader, not a rewrite.
"""

import json
import hashlib
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"

# ---------------------------------------------------------------------------
# The register, as ratified. Mirrors db/seed_heartbeat_register.sql.
# A heartbeat absent from this dict cannot be emitted — same rule the foreign
# key enforces in Postgres.
# ---------------------------------------------------------------------------

REGISTER = {
    "HB-0004": ("Canonical Object Created", "operational", "Object Service", 10, 4),
    "HB-0005": ("Canonical Object Updated", "governance", "Object Service", 10, 4),
    "HB-0009": ("Evidence Attached", "integrity", "Evidence Engine", 8, 3),
    "HB-0013": ("Value Baseline Established", "financial", "Value Engine", 9, 4),
    "HB-0014": ("Value Target Committed", "governance", "Governance Engine", 9, 4),
    "HB-0015": ("Value Realized", "financial", "Value Engine", 10, 4),
    "HB-0016": ("Value Verified", "constitutional", "Governance Engine", 10, 5),
    "HB-0017": ("Realization Record Published", "integrity", "Repository", 9, 5),
    "HB-0018": ("Capability Change Evidenced", "learning", "Assessment Engine", 7, 3),
}

# COMPASS-HEARTBEAT-STATUS §7 as amended by AMENDMENT-003.
# Seven dimensions, weights sum to 100.
#
# Financial is 10, not 20. Appendix A places Performance eighth and last:
# institutional health measures faithfulness, not winning. A Chapel that
# correctly refused to overclaim in a quarter with no realization is faithful,
# not unhealthy.
HEALTH_DIMENSIONS = {
    "Constitutional Compliance": 25,   # AMD-003: was 30
    "Governance Integrity": 25,
    "Operational Health": 15,          # AMD-003: was 20
    "Data Integrity": 10,
    "Security": 10,
    "Financial / Value Realization": 10,  # AMD-003: new
    "Learning & Improvement": 5,
}

# Total mapping — every constitutional category has exactly one dimension.
CATEGORY_TO_DIMENSION = {
    "constitutional": "Constitutional Compliance",
    "governance": "Governance Integrity",
    "operational": "Operational Health",
    "integrity": "Data Integrity",
    "security": "Security",
    "financial": "Financial / Value Realization",  # AMD-003 resolves F1
    "learning": "Learning & Improvement",
}


# ---------------------------------------------------------------------------
# Confidence model
#
# Confidence is COMPUTED from the evidence ledger, never asserted by a human.
# A value engineer who could type "high" would eventually type it under
# pressure. The factors below are the questions a CFO actually asks, weighted
# by how badly a negative answer damages the record.
#
# The computed value overrides any asserted value. Where they disagree, the
# record must print both and say which governs.
# ---------------------------------------------------------------------------

CONFIDENCE_FACTORS = {
    "metric_definition_confirmed": (20, "Is the metric's calculation method known and documented?"),
    "baseline_evidence_verified":  (25, "Is the baseline supported by source-verified evidence?"),
    "actual_evidence_verified":    (25, "Is the measured actual supported by source-verified evidence?"),
    "impact_basis_evidenced":      (10, "Is the currency figure's derivation stated and supported?"),
    "human_commit_of_record":      (10, "Did a named, non-synthetic person commit to the target?"),
    "human_verifier_of_record":    (10, "Did a named, non-synthetic person verify the result?"),
}

CONFIDENCE_BANDS = [(80, "high"), (55, "medium"), (0, "low")]

# ---------------------------------------------------------------------------
# Attestation credit
#
# In Use B a vendor measures a CUSTOMER's business metric. The vendor cannot
# independently verify the customer's internal figure — it has no access to the
# customer's system of record. Without a middle tier, 50 of the 100 confidence
# points would be permanently unreachable and the product would be unusable for
# the engagement it exists to serve.
#
# An attestation is the customer's own metric owner putting their name to the
# figure. In audit terms that is a management representation: necessary,
# accepted, and weaker than substantive testing.
#
# 0.6 is chosen deliberately. A flawlessly executed Use B record — definition
# confirmed, both sides attested, basis evidenced, real sponsor, real verifier —
# scores exactly 80, the floor of HIGH. It has to do everything right to get
# there, and it can never exceed 80 without genuine independent verification.
# That ceiling is the honest one.
#
# An attestation only counts if the attester is INSTITUTION-scoped and real. A
# vendor attesting to a customer's number is an assertion wearing a signature.
# ---------------------------------------------------------------------------

ATTESTATION_CREDIT = 0.6


def _evidence_credit(ev, persons):
    """Return (credit 0..1, label) for one evidence item."""
    if not ev.get("source_verified"):
        return 0.0, "unverified"

    if ev.get("kind") == "attestation" or ev.get("attested_by"):
        who = ev.get("attested_by")
        p = persons.get(who) if who else None
        if p is None:
            return 0.0, "attestation with no named attester"
        if p.get("synthetic"):
            return 0.0, f"attester synthetic ({p['name']})"
        if p.get("scope") != "institution":
            return 0.0, f"attester is vendor-side ({p['name']}) — not an authority on the customer's metric"
        return ATTESTATION_CREDIT, f"attested by {p['name']}, {p['title']}"

    return 1.0, "independently source-verified"


class Spine:
    """Walks the value spine and accumulates a heartbeat ledger."""

    def __init__(self, fixture):
        self.fx = fixture
        self.events = []
        self.findings = []
        self.seq = 0

    # -- heartbeat emission -------------------------------------------------

    def emit(self, hb_id, *, stage, subject_table, subject_id, actor,
             payload, health_state="healthy", actor_is_agent=False):
        """Emit one heartbeat. Refuses unregistered IDs, as the FK would."""
        if hb_id not in REGISTER:
            raise ValueError(
                f"{hb_id} is not in the register. HEARTBEAT-REGISTER §1: "
                f"an unregistered heartbeat is not constitutional. "
                f"Amend the register through governance."
            )
        name, category, producer, weight, severity = REGISTER[hb_id]
        self.seq += 1

        body = {
            "heartbeatId": hb_id,
            "eventType": name,
            "producer": producer,
            "valueStage": stage,
            "subjectTable": subject_table,
            "subjectId": subject_id,
            "actorPersonId": actor,
            "payload": payload,
        }
        # §12 — cryptographically hashed, tamper-evident
        content_hash = hashlib.sha256(
            json.dumps(body, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()

        self.events.append({
            "seq": self.seq,
            **body,
            "category": category,
            "healthWeight": weight,
            "severity": 0 if health_state == "healthy" else severity,
            "healthState": health_state,
            "constitutionalAuthority": self.fx["run"]["constitutional_authority"],
            "contractVersion": self.fx["run"]["contract_version"],
            "contentHash": content_hash,
            "actorIsAgent": actor_is_agent,
            "occurredAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        })
        return content_hash

    # -- the seven stages ---------------------------------------------------

    def stage_baseline(self):
        vo = self.fx["value_outcome"]
        bm = self.fx["business_metric"]
        self.emit(
            "HB-0013", stage="baseline",
            subject_table="value_outcomes", subject_id="VO-0001",
            actor=self.fx["persons"]["value_engineer"]["name"],
            payload={
                "metric": bm["name"],
                "sourceSystem": bm["source_system"],
                "baselineValue": vo["baseline_value"],
                "baselineMeasuredAt": vo["baseline_measured_at"],
                "sourced": vo["baseline_sourced"],
            },
        )
        for ev in self.fx["evidence"]:
            if ev["supports"] == "baseline":
                self.emit(
                    "HB-0009", stage="baseline",
                    subject_table="evidence", subject_id="EV-BASE",
                    actor=self.fx["persons"]["value_engineer"]["name"],
                    payload={"provenance": ev["provenance"],
                             "sourceVerified": ev["source_verified"]},
                )

    def stage_attach(self):
        cap = self.fx["capability"]
        self.emit(
            "HB-0004", stage="attach",
            subject_table="capabilities", subject_id="CAP-0001",
            actor=self.fx["persons"]["value_engineer"]["name"],
            payload={"capability": cap["name"], "roleFamily": cap["role_family"],
                     "attachedToMetric": self.fx["business_metric"]["name"]},
        )

    def stage_model(self):
        vo = self.fx["value_outcome"]
        self.emit(
            "HB-0005", stage="model",
            subject_table="value_outcomes", subject_id="VO-0001",
            actor=self.fx["persons"]["value_engineer"]["name"],
            payload={"targetValue": vo["target_value"],
                     "currencyImpact": vo["currency_impact"],
                     "impactBasisStated": bool(vo.get("impact_basis"))},
        )
        # Schema CHECK value_outcomes_impact_requires_basis, enforced here too.
        if vo.get("currency_impact") is not None and not vo.get("impact_basis"):
            raise ValueError("currency_impact requires impact_basis")

    def stage_commit(self):
        vo = self.fx["value_outcome"]
        sponsor = self.fx["persons"]["sponsor"]
        self.emit(
            "HB-0014", stage="commit",
            subject_table="value_outcomes", subject_id="VO-0001",
            actor=sponsor["name"],
            payload={"targetValue": vo["target_value"],
                     "committedBy": sponsor["name"],
                     "synthetic": sponsor["synthetic"]},
            health_state="watch" if sponsor["synthetic"] else "healthy",
        )
        if sponsor["synthetic"]:
            self.findings.append(
                ("F2", "watch",
                 "HB-0014 committed by a synthetic sponsor. A real commitment "
                 "requires a named customer sponsor; this event is simulated "
                 "and the outcome may not be published externally.")
            )

    def stage_measure(self):
        a = self.fx["assessment"]
        self.emit(
            "HB-0018", stage="measure",
            subject_table="assessments", subject_id="AS-0001",
            actor=self.fx["persons"]["assessor"]["name"],
            payload={"score": a["score"], "priorScore": a["prior_score"],
                     "scaleMax": a["scale_max"], "aiAssisted": a["ai_assisted"]},
            actor_is_agent=False,
        )
        vo = self.fx["value_outcome"]
        self.emit(
            "HB-0015", stage="measure",
            subject_table="value_outcomes", subject_id="VO-0001",
            actor=self.fx["persons"]["metric_owner"]["name"],
            payload={"actualValue": vo["actual_value"],
                     "actualMeasuredAt": vo["actual_measured_at"],
                     "simulated": vo["actual_simulated"]},
            health_state="watch" if vo["actual_simulated"] else "healthy",
        )

    def stage_verify(self):
        """The disclosure gate. HB-0016 is severity 5 for a reason."""
        vo = self.fx["value_outcome"]
        actual_ev = [e for e in self.fx["evidence"] if e["supports"] == "actual"]
        # The gate asks whether the source was confirmed by an authority over it,
        # not how strong that confirmation is. Attestation by the customer's own
        # metric owner satisfies the gate; the confidence model separately records
        # that it is weaker than independent verification.
        all_verified = bool(actual_ev) and any(
            _evidence_credit(e, self.fx["persons"])[0] > 0 for e in actual_ev)
        verifier = self.fx["persons"]["verifier"]

        if all_verified and not verifier["synthetic"]:
            realization, state = "verified", "healthy"
        else:
            realization, state = "measured", "warning"
            self.findings.append(
                ("F3", "warning",
                 "Verification REFUSED. Evidence supporting the measured actual "
                 "is not source-verified and the verifier is synthetic. The "
                 "outcome remains 'measured'. Schema CHECK "
                 "value_outcomes_verified_requires_human would reject an attempt "
                 "to force 'verified'.")
            )

        self.emit(
            "HB-0016", stage="verify",
            subject_table="value_outcomes", subject_id="VO-0001",
            actor=verifier["name"],
            payload={"realizationAdvancedTo": realization,
                     "allActualEvidenceVerified": all_verified,
                     "verifierSynthetic": verifier["synthetic"]},
            health_state=state,
        )
        return realization

    def stage_return(self, record_hash, disclosure):
        self.emit(
            "HB-0017", stage="verify",
            subject_table="record_documents", subject_id="RD-0001",
            actor=self.fx["persons"]["value_engineer"]["name"],
            payload={"contentHash": record_hash, "disclosure": disclosure,
                     "documentVersion": 1},
            health_state="healthy" if disclosure != "customer_shared" else "watch",
        )
        sr = self.fx["stewardship_return"]
        self.emit(
            "HB-0004", stage="return",
            subject_table="stewardship_returns", subject_id="SR-0001",
            actor=self.fx["persons"]["value_engineer"]["name"],
            payload={"kind": sr["kind"], "summary": sr["summary"],
                     "targetChapel": sr["target_chapel"]},
        )

    # -- health -------------------------------------------------------------

    def health(self):
        """
        COMPASS-HEARTBEAT-STATUS §7. Weighted composite.

        Dimensions with NO events are reported UNMEASURED, not scored 100.
        AMENDMENT-001 Article VII: a completion figure against nothing executed
        cannot be asserted.
        """
        state_score = {"healthy": 100, "watch": 85, "warning": 68,
                       "critical": 50, "constitutional_failure": 30}
        buckets, unmapped = {}, []

        for e in self.events:
            dim = CATEGORY_TO_DIMENSION.get(e["category"])
            if dim is None:
                unmapped.append(e["heartbeatId"])
                continue
            buckets.setdefault(dim, []).append(
                (e["healthWeight"], state_score[e["healthState"]])
            )

        if unmapped:
            self.findings.append(
                ("F1", "warning",
                 f"{len(unmapped)} event(s) in the 'financial' category have no "
                 f"health dimension. HEARTBEAT-REGISTER §6 defines seven "
                 f"categories; COMPASS-HEARTBEAT-STATUS §7 defines six "
                 f"dimensions. Financial value realization is unrepresented in "
                 f"institutional health. Requires a Cathedral amendment.")
            )

        dims, measured_weight, weighted = [], 0, 0.0
        for name, weight in HEALTH_DIMENSIONS.items():
            rows = buckets.get(name)
            if not rows:
                dims.append({"dimension": name, "weight": weight,
                             "score": None, "state": "UNMEASURED"})
                continue
            wsum = sum(w for w, _ in rows)
            score = sum(w * s for w, s in rows) / wsum
            dims.append({"dimension": name, "weight": weight,
                         "score": round(score, 1), "state": "measured",
                         "events": len(rows)})
            weighted += score * weight
            measured_weight += weight

        composite = round(weighted / measured_weight, 1) if measured_weight else None
        if composite is None:
            band = "UNMEASURED"
        elif composite >= 90:
            band = "HEALTHY"
        elif composite >= 75:
            band = "WATCH"
        elif composite >= 60:
            band = "WARNING"
        elif composite >= 40:
            band = "CRITICAL"
        else:
            band = "CONSTITUTIONAL FAILURE"

        return {
            "dimensions": dims,
            "composite": composite,
            "band": band,
            "coverage_pct": measured_weight,
            "basis": (f"Weighted over {measured_weight}% of defined dimension "
                      f"weight. Unmeasured dimensions are excluded from the "
                      f"denominator rather than assumed compliant."),
            "unmapped_events": unmapped,
        }

    # -- delta --------------------------------------------------------------

    def delta(self):
        vo = self.fx["value_outcome"]
        b, t, a = vo["baseline_value"], vo.get("target_value"), vo.get("actual_value")
        direction = self.fx["business_metric"]["direction"]
        if a is None:
            return {"available": False}
        raw = a - b
        improved = raw > 0 if direction == "increase" else raw < 0
        return {
            "available": True,
            "raw": round(raw, 3),
            "improved": improved,
            "target_met": (a >= t if direction == "increase" else a <= t) if t is not None else None,
            "pct_of_target": (round((raw / (t - b)) * 100, 1)
                              if t is not None and (t - b) != 0 else None),
        }

    # -- confidence ---------------------------------------------------------

    def confidence(self):
        """
        Derive confidence from the evidence ledger. Returns awarded points per
        factor with the reason, so the record can show its work.
        """
        fx = self.fx
        bm, vo = fx["business_metric"], fx["value_outcome"]
        ev = fx["evidence"]
        rows = []

        def award(key, earned, note):
            weight, question = CONFIDENCE_FACTORS[key]
            rows.append({"factor": key, "question": question, "weight": weight,
                         "earned": round(earned, 1), "note": note})

        # 1. Metric definition confirmed
        confirmed = bool(bm.get("calculation_confirmed"))
        award("metric_definition_confirmed",
              CONFIDENCE_FACTORS["metric_definition_confirmed"][0] if confirmed else 0,
              "Calculation method documented." if confirmed else
              "Calculation method NOT disclosed by the source. The metric cannot be "
              "independently reproduced.")

        # 2 & 3. Evidence strength by what it supports. Graded, not binary:
        # independent verification earns full credit, attestation earns
        # ATTESTATION_CREDIT, anything else earns nothing.
        persons = fx["persons"]
        for key, supports in (("baseline_evidence_verified", "baseline"),
                              ("actual_evidence_verified", "actual")):
            weight = CONFIDENCE_FACTORS[key][0]
            rel = [e for e in ev if e["supports"] == supports]
            if not rel:
                award(key, 0, f"No evidence attached to the {supports}.")
                continue
            graded = [_evidence_credit(e, persons) for e in rel]
            best = max(c for c, _ in graded)
            note = next(lbl for c, lbl in graded if c == best)
            n_att = sum(1 for c, _ in graded if 0 < c < 1)
            n_ind = sum(1 for c, _ in graded if c >= 1)
            detail = (f"{len(rel)} item(s): {n_ind} independent, {n_att} attested. "
                      f"Strongest — {note}.")
            award(key, weight * best, detail)

        # 4. Impact basis
        weight = CONFIDENCE_FACTORS["impact_basis_evidenced"][0]
        if vo.get("currency_impact") is None:
            award("impact_basis_evidenced", weight,
                  "No currency figure claimed — nothing to substantiate.")
        else:
            basis_ev = [e for e in ev if e["supports"] == "impact_basis"]
            has_basis = bool(vo.get("impact_basis"))
            graded = [_evidence_credit(e, fx["persons"]) for e in basis_ev]
            best = max((c for c, _ in graded), default=0.0)
            if has_basis and best > 0 and not vo.get("impact_is_inference", True):
                note = next(lbl for c, lbl in graded if c == best)
                award("impact_basis_evidenced", weight, f"Basis stated and evidenced — {note}.")
            elif has_basis and best > 0:
                award("impact_basis_evidenced", weight * 0.5,
                      "Basis stated and evidenced, but self-declared as inference. "
                      "Half credit.")
            else:
                award("impact_basis_evidenced", 0,
                      "Currency claimed without stated, evidenced basis.")

        # 5 & 6. Human actors of record
        for key, who in (("human_commit_of_record", "sponsor"),
                         ("human_verifier_of_record", "verifier")):
            weight = CONFIDENCE_FACTORS[key][0]
            p = fx["persons"][who]
            if p["synthetic"]:
                award(key, 0, f"{who.title()} of record is synthetic ({p['name']}).")
            else:
                award(key, weight, f"{p['name']} of record.")

        score = round(sum(r["earned"] for r in rows), 1)
        band = next(b for t, b in CONFIDENCE_BANDS if score >= t)
        asserted = vo.get("confidence")
        return {
            "factors": rows,
            "score": score,
            "band": band,
            "asserted": asserted,
            "overrides_assertion": asserted is not None and asserted != band,
            "method": ("Computed from the evidence ledger across six weighted factors. "
                       "The computed band governs; any asserted value is advisory."),
        }

    # -- run ----------------------------------------------------------------

    def run(self):
        self.stage_baseline()
        self.stage_attach()
        self.stage_model()
        self.stage_commit()
        self.stage_measure()
        realization = self.stage_verify()

        disclosure = "customer_shared" if realization == "verified" else "internal"
        record_hash = hashlib.sha256(
            json.dumps(self.fx, sort_keys=True).encode()
        ).hexdigest()

        self.stage_return(record_hash, disclosure)

        conf = self.confidence()
        if conf["band"] == "low":
            self.findings.append(
                ("F4", "warning",
                 f"Computed confidence is {conf['score']}/100 (LOW). The record is "
                 f"not defensible to a finance function in this state. Confidence "
                 f"is derived from the evidence ledger and cannot be overridden by "
                 f"assertion."))

        return {
            "realization": realization,
            "disclosure": disclosure,
            "record_hash": record_hash,
            "events": self.events,
            "health": self.health(),
            "delta": self.delta(),
            "confidence": conf,
            "findings": self.findings,
        }


def main():
    fixture_name = sys.argv[1] if len(sys.argv) > 1 else "customer_zero.json"
    fixture_path = HERE / fixture_name
    fixture = json.loads(fixture_path.read_text())
    result = Spine(fixture).run()

    # Stamp the run with the fixture that produced it. render_record.py refuses
    # to render if this does not match the fixture it was asked for — otherwise a
    # stale run silently produces a document with the wrong numbers, which is
    # worse than a crash.
    stem = Path(fixture_name).stem
    result["source_fixture"] = stem

    OUT.mkdir(exist_ok=True)
    # Per-fixture filename. A single fixed name meant a second run overwrote the
    # first, so a portfolio could never exist. confirmation_gap.py globs these.
    (OUT / f"spine_run_{stem}.json").write_text(json.dumps(result, indent=2))

    # ---- console ledger --------------------------------------------------
    print("\n" + "=" * 78)
    print("LVRF VALUE SPINE — CUSTOMER ZERO")
    print("=" * 78)
    print(f"\nHeartbeat ledger ({len(result['events'])} events)\n")
    print(f"{'#':>2}  {'HB':<9} {'STAGE':<9} {'CATEGORY':<15} {'STATE':<9} {'HASH':<10}")
    print("-" * 78)
    for e in result["events"]:
        print(f"{e['seq']:>2}  {e['heartbeatId']:<9} {e['valueStage']:<9} "
              f"{e['category']:<15} {e['healthState']:<9} {e['contentHash'][:8]}..")

    d = result["delta"]
    print(f"\nValue delta")
    print("-" * 78)
    if d["available"]:
        print(f"  raw change      {d['raw']:+}")
        print(f"  improved        {d['improved']}")
        print(f"  target met      {d['target_met']}")
        print(f"  % of target     {d['pct_of_target']}%")

    h = result["health"]
    print(f"\nInstitutional health")
    print("-" * 78)
    for dim in h["dimensions"]:
        s = "UNMEASURED" if dim["score"] is None else f"{dim['score']:>5}"
        print(f"  {dim['dimension']:<28} w{dim['weight']:>3}%   {s}")
    print(f"\n  COMPOSITE       {h['composite']}   [{h['band']}]")
    print(f"  COVERAGE        {h['coverage_pct']}% of dimension weight measured")

    c = result["confidence"]
    print(f"\nComputed confidence")
    print("-" * 78)
    for f in c["factors"]:
        print(f"  {f['factor']:<30} {f['earned']:>5} / {f['weight']:<3}")
    print(f"\n  SCORE           {c['score']} / 100   [{c['band'].upper()}]")
    if c["overrides_assertion"]:
        print(f"  asserted was '{c['asserted']}' — computed band governs")

    print(f"\nRealization       {result['realization'].upper()}")
    print(f"Disclosure        {result['disclosure'].upper()}")
    print(f"Record hash       {result['record_hash'][:16]}..")

    if result["findings"]:
        print(f"\nFindings ({len(result['findings'])})")
        print("-" * 78)
        for code, sev, msg in result["findings"]:
            print(f"  [{code}] {sev.upper()}")
            for line in _wrap(msg, 72):
                print(f"        {line}")
    print(f"written           out/spine_run_{stem}.json")
    print()
    return result


def _wrap(text, width):
    words, line, out = text.split(), "", []
    for w in words:
        if len(line) + len(w) + 1 > width:
            out.append(line); line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        out.append(line)
    return out


if __name__ == "__main__":
    main()

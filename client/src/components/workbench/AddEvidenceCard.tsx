import { useState } from 'react';
import type { Run } from '../../types/run';
import { Card, Badge } from './Card';
import { GovernedForm, FOCUS_RING } from '../GovernedForm';

const KIND_OPTIONS = [
  'assessment_result',
  'system_export',
  'artifact',
  'observation',
  'attestation',
  'public_filing',
  'vendor_publication',
] as const;

// Only these three are understood by walkSpine.ts and confidenceModel.ts —
// same restriction server/routes/outcomeEvidence.ts enforces, matched here
// so a caller cannot even select a fourth.
const SUPPORTS_OPTIONS = ['baseline', 'actual', 'impact_basis'] as const;

const CONFIDENCE_OPTIONS = ['low', 'medium', 'high'] as const;

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS =
  'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

interface AddEvidenceResponse {
  evidence_id: string;
  outcome_id: string;
  supports: string;
}

// A tri-state select, not a checkbox: 'source_verified'/'ai_sourced'/
// 'simulated' all carry meaning, and a checkbox defaults to unchecked
// without the visitor ever choosing false. This type's '' state is what
// keeps that choice unmade until someone makes it.
type YesNo = '' | 'true' | 'false';

/**
 * Q4c2: bound to an outcome directly (`outcomeId`) as well as through a run
 * (`run`), so the outside-in walk can attach evidence BEFORE the first run —
 * then one run is produced and locked with its evidence. The run page's use
 * is unchanged.
 */
export function AddEvidenceCard({
  run,
  outcomeId: outcomeIdProp,
  n = '01A',
  onRecorded,
  primary = false,
}: {
  run?: Run;
  outcomeId?: string;
  n?: string;
  onRecorded?: () => void;
  /** UX-1: the open step's next action (see GovernedForm's primary). */
  primary?: boolean;
}) {
  const outcomeId = outcomeIdProp ?? run?.payload.valueOutcomeId;

  const [provenance, setProvenance] = useState('');
  const [kind, setKind] = useState('');
  const [sourceReference, setSourceReference] = useState('');
  const [summary, setSummary] = useState('');
  const [supports, setSupports] = useState('');
  const [confidence, setConfidence] = useState('');
  const [sourceVerified, setSourceVerified] = useState<YesNo>('');
  const [aiSourced, setAiSourced] = useState<YesNo>('');
  const [researchQuery, setResearchQuery] = useState('');
  const [researchTool, setResearchTool] = useState('');
  const [simulated, setSimulated] = useState<YesNo>('');

  if (!outcomeId) {
    // Same pattern EvidenceCard.tsx already uses for a run walked before
    // evidence was captured into the payload: degrade honestly rather than
    // assume a field a historical run's payload never had. Seven of eight
    // production runs predate valueOutcomeId — see client/src/types/run.ts.
    return (
      <Card
        n={n}
        title="Add evidence"
        badge={<Badge tone="neutral">Unavailable on this run</Badge>}
      >
        <p className="m-0 text-[12.5px] text-ink-70">
          This run was produced before valueOutcomeId was added to the payload. Evidence cannot
          be linked to an outcome this run does not name.
        </p>
      </Card>
    );
  }

  const provenanceValid = provenance.trim().length >= 12;
  const aiFieldsValid =
    aiSourced !== 'true' || (researchQuery.trim() !== '' && researchTool.trim() !== '');

  // No field defaults to a plausible value: every select below starts on
  // the disabled '— choose —' option, and canSubmit stays false until each
  // one has been explicitly set — including the three yes/no fields, which
  // a checkbox would have silently resolved to false on page load.
  // Q4k: AI-sourced evidence is always recorded unverified.
  const effectiveVerified: YesNo = aiSourced === 'true' ? 'false' : sourceVerified;
  const canSubmit =
    provenanceValid &&
    kind !== '' &&
    summary.trim() !== '' &&
    supports !== '' &&
    confidence !== '' &&
    effectiveVerified !== '' &&
    aiSourced !== '' &&
    simulated !== '' &&
    aiFieldsValid;

  return (
    <Card n={n} title="Add evidence">
      <GovernedForm<AddEvidenceResponse>
        primary={primary}
        onSuccess={() => onRecorded?.()}
        path={`/api/value-outcomes/${outcomeId}/evidence`}
        canSubmit={canSubmit}
        buildBody={() => ({
          kind,
          summary,
          provenance,
          supports,
          confidence,
          ...(sourceReference.trim() !== '' ? { source_reference: sourceReference } : {}),
          source_verified: effectiveVerified === 'true',
          ai_sourced: aiSourced === 'true',
          simulated: simulated === 'true',
          ...(aiSourced === 'true'
            ? { research_query: researchQuery, research_tool: researchTool }
            : {}),
        })}
        renderSuccess={() => (
          <p className="m-0">
            Evidence recorded. This ledger is a snapshot taken when this run was produced and
            will not change. Produce a new run to see this evidence scored.
          </p>
        )}
        provenance={
          <>
            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Provenance (required)</span>
              <textarea
                required
                minLength={12}
                rows={3}
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Kind</span>
              <select
                required
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  — choose —
                </option>
                {KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              {/* R1, refined (Brad, 12 Oct 2026; LVRF_PLAN §3). */}
              <span className="mt-1 block text-[11px] text-ink-45" data-testid="kind-help">
                A company's formal annual disclosure report — a 10-K, annual report, or CR, sustainability or ESG
                report — is <code>public_filing</code>. Looser company material — a press release, web page, blog
                post, job posting or marketing — is <code>observation</code>.
              </span>
            </label>

            <label className="block">
              <span className={LABEL_CLASS}>Source reference (optional)</span>
              <input
                type="text"
                value={sourceReference}
                onChange={(e) => setSourceReference(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </>
        }
        fields={
          <>
            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Summary</span>
              <textarea
                required
                rows={2}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Supports</span>
              <select
                required
                value={supports}
                onChange={(e) => setSupports(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  — choose —
                </option>
                {SUPPORTS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Confidence (the server will not accept a default)</span>
              <select
                required
                value={confidence}
                onChange={(e) => setConfidence(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  — choose —
                </option>
                {CONFIDENCE_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Source verified</span>
              {/* Q4k: AI-sourced evidence is recorded unverified and verified when a
                  person opens its citation (AMENDMENT-005 Article III); the route and
                  the CHECK refuse the combination, so the form does not offer it. */}
              <select
                required
                value={aiSourced === 'true' ? 'false' : sourceVerified}
                disabled={aiSourced === 'true'}
                onChange={(e) => setSourceVerified(e.target.value as YesNo)}
                className={INPUT_CLASS + (aiSourced === 'true' ? ' cursor-not-allowed bg-offwhite text-ink-45' : '')}
                data-testid="source-verified"
              >
                <option value="" disabled>
                  — choose —
                </option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            {aiSourced === 'true' && (
              <p className="-mt-2 mb-3 text-[11px] text-ink-45" data-testid="source-verified-reason">
                AI-sourced evidence is verified after its citation is opened, not when it's recorded (AMENDMENT-005,
                Article III). Record it unverified; then open its citation.
              </p>
            )}

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>AI-sourced</span>
              <select
                required
                value={aiSourced}
                onChange={(e) => setAiSourced(e.target.value as YesNo)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  — choose —
                </option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>

            {aiSourced === 'true' && (
              <>
                <label className="mb-3 block">
                  <span className={LABEL_CLASS}>Research query (required — AI-sourced)</span>
                  <input
                    type="text"
                    required
                    value={researchQuery}
                    onChange={(e) => setResearchQuery(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
                <label className="mb-3 block">
                  <span className={LABEL_CLASS}>Research tool (required — AI-sourced)</span>
                  <input
                    type="text"
                    required
                    value={researchTool}
                    onChange={(e) => setResearchTool(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            )}

            <label className="block">
              <span className={LABEL_CLASS}>Simulated</span>
              <select
                required
                value={simulated}
                onChange={(e) => setSimulated(e.target.value as YesNo)}
                className={INPUT_CLASS}
              >
                <option value="" disabled>
                  — choose —
                </option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </>
        }
      />
    </Card>
  );
}

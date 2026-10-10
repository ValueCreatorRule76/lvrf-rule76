import { useEffect, useState } from 'react';
import { Card } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';
import { useActor } from '../actor/ActorContext';
import { fetchIndustries, type IndustryListItem } from '../api/packs';

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS =
  'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const HELP_CLASS = 'm-0 mt-1 text-[11px] text-ink-45';

interface CreateAccountResponse {
  institution_id: string;
  classification: {
    industry_name: string;
    industry_slug: string;
    evidence_id: string;
  } | null;
  person_ids: string[];
  assessment_ids: string[];
}

// POST /api/account-inputs. GovernedForm already owns the actor
// requirement, the disabled fieldset, and all four result treatments —
// this form only supplies fields, the body shape, and what success means.
//
// TWO INDUSTRY FIELDS, ON PURPOSE. "Industry as stated" is free text — what
// the customer said — and lands in institutions.industry. "Classify as" is
// a judgement against the tenant's taxonomy and lands in industry_id via
// server/lib/classifyInstitution.ts, with the reasoning note as its
// evidence. Neither is derived from the other (see db/schema.ts's
// industry/industryId comment). Classifying is optional: an account can be
// created unclassified and classified later.
export function CreateAccountCard() {
  const { actor } = useActor();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [industrySlug, setIndustrySlug] = useState('');
  const [classificationNote, setClassificationNote] = useState('');
  const [industries, setIndustries] = useState<IndustryListItem[] | null>(null);
  const [industriesError, setIndustriesError] = useState<string | null>(null);

  // The taxonomy is tenant-scoped by the actor, so it can only be fetched
  // once an actor is chosen — and re-fetched if the actor changes.
  useEffect(() => {
    if (!actor) return;
    let cancelled = false;
    setIndustries(null);
    setIndustriesError(null);
    fetchIndustries(actor.id).then((r) => {
      if (cancelled) return;
      if (r.status === 'ok') setIndustries(r.industries);
      else setIndustriesError(r.message);
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  const classifying = industrySlug !== '';
  const canSubmit =
    name.trim() !== '' && (!classifying || classificationNote.trim() !== '');

  return (
    <Card n="01" title="Create account">
      <GovernedForm<CreateAccountResponse>
        path="/api/account-inputs"
        provenanceLabel="Provenance — how this account's industry was determined"
        canSubmit={canSubmit}
        buildBody={() => ({
          institution: {
            name,
            ...(website.trim() !== '' ? { website: website.trim() } : {}),
            ...(industry.trim() !== '' ? { industry } : {}),
            ...(classifying
              ? { industry_slug: industrySlug, classification_note: classificationNote }
              : {}),
          },
        })}
        renderSuccess={(data) => (
          <>
            <p className="m-0">
              Account created
              {data.classification
                ? ` and classified as ${data.classification.industry_name}.`
                : ', unclassified.'}{' '}
              It has no engagement, capability or value outcome yet, so nothing will appear in
              the run list until one is produced.
            </p>
            <p className="m-0 mt-2 font-mono text-[11px] text-ink-45">
              institution_id: {data.institution_id}
            </p>
          </>
        )}
        provenance={
          <>
            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Industry as stated (optional)</span>
              <input
                type="text"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={HELP_CLASS}>
                What the customer says they are, in their words. Stored as stated and never
                overwritten by a classification. Leave it empty if unknown.
              </p>
            </label>

            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Classify as (optional)</span>
              <select
                value={industrySlug}
                onChange={(e) => setIndustrySlug(e.target.value)}
                className={INPUT_CLASS}
                disabled={!industries}
              >
                <option value="">— leave unclassified —</option>
                {(industries ?? []).map((i) => (
                  <option key={i.slug} value={i.slug}>
                    {i.name}
                  </option>
                ))}
              </select>
              {industriesError ? (
                <p className={HELP_CLASS}>Taxonomy unavailable: {industriesError}</p>
              ) : (
                <p className={HELP_CLASS}>
                  Classification decides which industry pack applies. It is a judgement, and it
                  is final for this account — a wrong one is corrected by superseding the
                  account, not by editing it. Unclassified is an honest state.
                </p>
              )}
            </label>

            {classifying && (
              <label className="block">
                <span className={LABEL_CLASS}>Why this classification (required)</span>
                <textarea
                  required
                  rows={3}
                  value={classificationNote}
                  onChange={(e) => setClassificationNote(e.target.value)}
                  className={INPUT_CLASS}
                />
                <p className={HELP_CLASS}>
                  Recorded as evidence under your name — an observation, low confidence,
                  unverified. A classification with no stated reasoning is refused.
                </p>
              </label>
            )}
          </>
        }
        fields={
          <>
            <label className="mb-3 block">
              <span className={LABEL_CLASS}>Account name (required, unique per tenant)</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className="block">
              <span className={LABEL_CLASS}>Website (optional)</span>
              <input
                type="url"
                placeholder="https://"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={INPUT_CLASS}
              />
              <p className={HELP_CLASS}>Must start with http:// or https://.</p>
            </label>
          </>
        }
      />
    </Card>
  );
}

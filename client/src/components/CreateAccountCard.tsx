import { useState } from 'react';
import { Card } from './workbench/Card';
import { GovernedForm, FOCUS_RING } from './GovernedForm';

const LABEL_CLASS = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT_CLASS =
  'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

interface CreateAccountResponse {
  institution_id: string;
  person_ids: string[];
  assessment_ids: string[];
}

// POST /api/account-inputs. GovernedForm already owns the actor
// requirement, the disabled fieldset, and all four result treatments —
// this form only supplies fields, the body shape, and what success means.
export function CreateAccountCard() {
  const [industry, setIndustry] = useState('');
  const [name, setName] = useState('');

  const canSubmit = name.trim() !== '';

  return (
    <Card n="01" title="Create account">
      <GovernedForm<CreateAccountResponse>
        path="/api/account-inputs"
        provenanceLabel="Provenance — how this account's classification was determined"
        canSubmit={canSubmit}
        buildBody={() => ({
          institution: {
            name,
            ...(industry.trim() !== '' ? { industry } : {}),
          },
        })}
        renderSuccess={(data) => (
          <>
            <p className="m-0">
              Account created. It has no engagement, capability or value outcome yet, so nothing
              will appear in the run list until one is produced.
            </p>
            <p className="m-0 mt-2 font-mono text-[11px] text-ink-45">
              institution_id: {data.institution_id}
            </p>
          </>
        )}
        provenance={
          <label className="block">
            <span className={LABEL_CLASS}>Industry (optional)</span>
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              className={INPUT_CLASS}
            />
            <p className="m-0 mt-1 text-[11px] text-ink-45">
              Industry determines which business measures carry money for an account. It is
              asserted by whoever enters it, not sourced. Leave it empty if unknown — an empty
              industry is honest, a guessed one is not.
            </p>
          </label>
        }
        fields={
          <label className="block">
            <span className={LABEL_CLASS}>Account name (required, unique per tenant)</span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
        }
      />
    </Card>
  );
}

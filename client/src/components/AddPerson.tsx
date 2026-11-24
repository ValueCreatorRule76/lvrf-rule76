import { useState } from 'react';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * §32 (Brad's rulings, 24 Nov 2026) — the one "Add a person of this account" form, for W1 and card 01b (D5).
 * The email is optional, needed only to sign in (D2). The same name on this account is warned, not refused (D4): the
 * form shows who is already recorded and asks "Choose them" or "This is a different person"; only the second sends
 * different_from, which the new row records (confirmed_distinct_from), and the confirmation says it in full.
 */
export interface KnownPerson { id: string; full_name: string; title: string | null; roles?: string | null }

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const BTN = 'border border-ink px-2.5 py-1 text-[11.5px] font-semibold text-ink hover:bg-ink hover:text-offwhite ' + FOCUS_RING;
const nameKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const who = (p: KnownPerson) => `${p.full_name}${p.title ? `, ${p.title}` : ''}`;

export function AddPerson({ institutionId, known, onDone, onChoose, inline = false, provenance }: {
  institutionId: string;
  known: KnownPerson[];
  onDone: () => void;
  /** "Choose them": the add is cancelled and the caller takes the existing person (card 01b opens the role form). */
  onChoose?: (personId: string) => void;
  /** W1: the form is always shown; card 01b: behind "Add a person of this account…". */
  inline?: boolean;
  provenance?: React.ReactNode;
}) {
  const [open, setOpen] = useState(inline);
  const [p, setP] = useState({ full_name: '', email: '', title: '' });
  const [different, setDifferent] = useState(false);
  const [chose, setChose] = useState<string | null>(null);
  const reset = () => { setP({ full_name: '', email: '', title: '' }); setDifferent(false); };
  if (!open) {
    return <span className="flex flex-col gap-1">
      <button type="button" onClick={() => { setOpen(true); setChose(null); }} data-testid="person-add-open"
        className={'self-start border border-silver px-3 py-1.5 text-[12px] font-semibold text-ink-70 hover:border-ink hover:text-ink ' + FOCUS_RING}>Add a person of this account…</button>
      {chose && <span className="text-[11.5px] text-ink-45" data-testid="person-chose">{chose} is already recorded here: chosen, nothing added.</span>}
    </span>;
  }
  const same = p.full_name.trim() ? known.filter((k) => nameKey(k.full_name) === nameKey(p.full_name)) : [];
  const warn = same.length > 0 && !different;
  const unmet = [...(p.full_name.trim() ? [] : ['give the full name']), ...(warn ? ['choose them, or confirm this is a different person'] : [])];
  const distinctLine = different && same.length > 0 ? ` This is a different person from ${same.map(who).join(' and ')}, already recorded here.` : '';
  return (
    <div className={inline ? '' : 'border-t border-rule-soft pt-3'} data-testid="person-add">
      <GovernedForm<{ person_ids: string[] }>
        path={`/api/institutions/${institutionId}/inputs`} provenanceLabel="What this records"
        provenance={provenance ?? <p className="m-0 text-[12.5px] text-ink">A person of this account: the customer&apos;s own people only, never the analyst of record or anyone at your own company. Adding them names no role: name it on the roles card, from a source.</p>}
        fields={<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block"><span className={L}>Full name</span><input className={I} value={p.full_name} onChange={(e) => { setP({ ...p, full_name: e.target.value }); setDifferent(false); }} data-testid="person-add-name" /></label>
          <label className="block"><span className={L}>Email (optional; needed only to sign in)</span><input className={I} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} data-testid="person-add-email" /></label>
          <label className="block sm:col-span-2"><span className={L}>Title at the account</span><input className={I} value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} data-testid="person-add-title" /></label>
          {warn && (
            <div className="border-l-[3px] border-warning pl-3 sm:col-span-2" data-testid="person-same-name">
              <p className="m-0 text-[12.5px] text-ink">{same.map((k) => `${who(k)}${k.roles ? ` (${k.roles})` : ''}`).join('; ')} {same.length === 1 ? 'is' : 'are'} already recorded at this account.</p>
              <span className="mt-1.5 flex flex-wrap gap-2">
                <button type="button" className={BTN} data-testid="person-same-choose"
                  onClick={() => { setChose(same[0].full_name); setOpen(inline); reset(); onChoose?.(same[0].id); }}>Choose them</button>
                <button type="button" className={BTN} data-testid="person-same-different" onClick={() => setDifferent(true)}>This is a different person</button>
              </span>
            </div>)}
        </div>}
        confirm={<span data-testid="confirm-text">Add {p.full_name.trim()}{p.title.trim() ? `, ${p.title.trim()}` : ''}, as a person of this account.{distinctLine}</span>}
        canSubmit={unmet.length === 0} unmet={unmet}
        buildBody={() => ({ persons: [{ full_name: p.full_name.trim(), email: p.email.trim() || null, title: p.title.trim() || null,
          ...(different && same.length > 0 ? { different_from: same.map((k) => k.id) } : {}) }] })}
        submitLabel="Add the person" onSuccess={() => { reset(); if (!inline) setOpen(false); onDone(); }} renderSuccess={() => <>Added.</>} />
      {!inline && <button type="button" onClick={() => { setOpen(false); reset(); }} className={'mt-2 text-[11.5px] text-ink-45 underline ' + FOCUS_RING}>Cancel</button>}
    </div>
  );
}

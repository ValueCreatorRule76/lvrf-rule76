import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/http';
import { FOCUS_RING } from './GovernedForm';

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

export interface AccountChoice { id: string; name: string }

/** Which accounts "about" may name: the tenant's, read from the batch's list. */
export function useAccounts(): AccountChoice[] {
  const [accounts, setAccounts] = useState<AccountChoice[]>([]);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/evidence/about-batch').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!cancelled && j) setAccounts(j.accounts); }, () => undefined);
    return () => { cancelled = true; };
  }, []);
  return accounts;
}

/** L41-D1: what evidence is about. Defaults to this account; the choice is always shown. */
export function useAbout(institutionId: string | undefined): { fields: ReactNode; body: () => unknown; unmet: string[] } {
  const accounts = useAccounts();
  const [choice, setChoice] = useState('account');
  const [party, setParty] = useState('');
  const other = choice === 'other_party';
  const fields = (
    <div className="mb-3 flex flex-col gap-2" data-testid="about-field">
      <label className="block"><span className={L}>What it is about</span>
        <select className={I} value={choice} onChange={(ev) => setChoice(ev.target.value)} data-testid="about-choice">
          <option value="account">This account</option>
          {accounts.filter((a) => a.id !== institutionId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          <option value="other_party">Another company, named</option>
        </select></label>
      {other && <label className="block"><span className={L}>The company</span>
        <input className={I} value={party} onChange={(ev) => setParty(ev.target.value)} data-testid="about-party" /></label>}
    </div>
  );
  return {
    fields,
    body: () => (choice === 'account' ? 'account' : other ? { other_party: party.trim() } : { institution_id: choice }),
    unmet: other && party.trim().length < 3 ? ['name the company this evidence is about'] : [],
  };
}

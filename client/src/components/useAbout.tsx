import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch } from '../api/http';
import { FOCUS_RING } from './GovernedForm';
import { AboutSelect, type AccountChoice } from './AboutSelect';

const L = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

/** Which accounts "about" may name: the tenant's, read from the batch's list; 'failed' stops the form rather than dropping the tenant. */
export function useAccounts(): AccountChoice[] | null | 'failed' {
  const [accounts, setAccounts] = useState<AccountChoice[] | null | 'failed'>(null);
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/evidence/about-batch').then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => { if (!cancelled) setAccounts(j.accounts); }, () => { if (!cancelled) setAccounts('failed'); });
    return () => { cancelled = true; };
  }, []);
  return accounts;
}

/** What the choice sends: L41-D1's three shapes. */
export const aboutBody = (choice: string, party: string): unknown =>
  (choice === 'account' ? 'account' : choice === 'other_party' ? { other_party: party.trim() } : { institution_id: choice });

/** L41-D1: what evidence is about. L52: nothing is pre-filled; the choice is always made. */
export function useAbout(institutionId: string | undefined): { fields: ReactNode; body: () => unknown; unmet: string[] } {
  const accounts = useAccounts();
  const [choice, setChoice] = useState('');
  const [party, setParty] = useState('');
  const other = choice === 'other_party';
  const ready = Array.isArray(accounts);
  const fields = (
    <div className="mb-3 flex flex-col gap-2" data-testid="about-field">
      <label className="block"><span className={L}>What it is about</span>
        {ready
          ? <AboutSelect accounts={accounts} ownId={institutionId} value={choice} onChange={setChoice} />
          : <select className={I} disabled value="" data-testid="about-choice"><option value="">{accounts === 'failed' ? "Couldn't load the accounts" : 'loading'}</option></select>}</label>
      {other && <label className="block"><span className={L}>The company</span>
        <input className={I} value={party} onChange={(ev) => setParty(ev.target.value)} data-testid="about-party" /></label>}
    </div>
  );
  return {
    fields,
    body: () => aboutBody(choice, party),
    unmet: [...(accounts === 'failed' ? ["the accounts couldn't be loaded, so what this is about can't be stated: reload the page"] : []),
      ...(ready && choice === '' ? ['say what this evidence is about'] : []),
      ...(other && party.trim().length < 3 ? ['name the company this evidence is about'] : [])],
  };
}

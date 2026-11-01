import { FOCUS_RING } from './GovernedForm';

export interface AccountChoice { id: string; name: string; is_tenant_self: boolean }

const I = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;

/**
 * L52 (Brad, 1 Nov 2026): the one control for what evidence is about. It always offers this account, the tenant,
 * every other account and a typed company, and starts at "choose": nothing is pre-filled here. The value is
 * 'account', an account's id, or 'other_party'; '' until chosen.
 */
export function AboutSelect({ accounts, ownId, ownName, value, onChange, disabled, className = I, testId = 'about-choice' }: {
  accounts: AccountChoice[]; ownId?: string; ownName?: string; value: string; onChange: (v: string) => void; disabled?: boolean; className?: string; testId?: string;
}) {
  const others = accounts.filter((a) => a.id !== ownId && a.name !== ownName);
  return (
    <select className={className} value={value} disabled={disabled} onChange={(ev) => onChange(ev.target.value)} data-testid={testId}>
      <option value="" disabled>— choose —</option>
      <option value="account">{ownName ? `${ownName} (this account)` : 'This account'}</option>
      {others.map((a) => <option key={a.id} value={a.id}>{a.is_tenant_self ? `${a.name} (the tenant)` : a.name}</option>)}
      <option value="other_party">Another company, named</option>
    </select>
  );
}

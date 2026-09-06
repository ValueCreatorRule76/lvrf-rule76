import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchInstitutions, type FetchInstitutionsResult } from '../api/institutions';
import { Card } from '../components/workbench/Card';
import { CreateAccountCard } from '../components/CreateAccountCard';

// The front door. Card 00 is this table; CreateAccountCard (card 01, its
// own number, unchanged) moved here from RunsIndexPage — it is an
// accounts thing, and this is the accounts page now.
export function AccountsIndexPage() {
  const [result, setResult] = useState<FetchInstitutionsResult | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    fetchInstitutions().then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!result) return <p className="p-8 text-ink-45">loading</p>;
  if (result.status === 'error') {
    return <p className="p-8 text-critical">{result.message}</p>;
  }

  const { institutions } = result;

  return (
    <div className="mx-auto max-w-5xl px-[30px] pb-14 pt-6">
      <header className="mb-[22px]">
        <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
          LVRF
        </span>
        <h1 className="m-0 my-1.5 font-display text-[40px] leading-[.98] tracking-[.012em]">
          Accounts
        </h1>
      </header>

      <Card n="00" title="Accounts">
        {institutions.length === 0 ? (
          // Card 01 (CreateAccountCard) is already on this page, so this
          // states the fact and stops there — no call to action needed.
          <p className="m-0 text-[12.5px] text-ink-45">No accounts exist yet.</p>
        ) : (
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr>
                {['Name', 'Industry', 'Engagements'].map((h) => (
                  <th
                    key={h}
                    className="whitespace-nowrap border-b border-silver px-3 py-[9px] text-left text-[9.5px] font-semibold uppercase tracking-[.13em] text-ink-45"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  onClick={() => navigate(`/accounts/${inst.id}`)}
                  className="cursor-pointer hover:bg-offwhite"
                >
                  <td className="border-b border-rule-soft px-3 py-[9px] font-semibold text-ink">
                    {inst.name}
                  </td>
                  <td className="border-b border-rule-soft px-3 py-[9px]">
                    {inst.industry_name ?? <span className="text-ink-45">Unclassified</span>}
                  </td>
                  <td className="border-b border-rule-soft px-3 py-[9px] font-mono">
                    {inst.engagement_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <CreateAccountCard />
    </div>
  );
}

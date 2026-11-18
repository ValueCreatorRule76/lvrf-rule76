import { useEffect, useState } from 'react';
import { fetchAiStatus, fetchAiSubject, type AiCall, type AiStatus, type AiSubject } from '../api/aiResearch';
import { useActor } from '../actor/ActorContext';
import { Card, Badge } from './workbench/Card';
import { FOCUS_RING, GovernedForm } from './GovernedForm';

/**
 * S2 (3.1; LVRF_PLAN §21, approved by Brad 18 Nov 2026) — research with Claude, on an account's Research step and a
 * pack's research page. Three forms, each with a confirmation showing every field in full (the 3.1 steward-form item):
 *
 *   Clear for research with Claude…   the steward; the disclosure in full, the reason in full
 *   Withdraw the clearance…           the steward; the clearance's reason and the withdrawal's, in full
 *   Research with Claude…             authorized; the prompt, the model, the clearance, the caps, the month's spend
 *
 * The answer is imported by the person ("Import the answer") through the same parse route as a paste, and every field
 * is then reviewed as before. Nothing here holds a key or talks to Anthropic: the server's research process does (D2).
 */

const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45';
const INPUT = 'w-full border border-rule bg-white px-2.5 py-1.5 text-[13px] text-ink ' + FOCUS_RING;
const QUOTE = 'm-0 whitespace-pre-wrap border-l-2 border-rule pl-3 text-[12.5px] leading-relaxed text-ink';
const short = (id: string) => id.slice(0, 8);
const when = (ts: string) => ts.replace('T', ' ').slice(0, 16) + ' UTC';
const usd = (n: number | string) => `$${Number(n).toFixed(2)}`;

const STATE_LABEL: Record<AiCall['state'], string> = {
  running: 'running', interrupted: 'interrupted: no answer recorded', answered: 'answered', refused: 'refused by the model',
  truncated: 'cut short', failed: 'failed', timeout: 'timed out',
};

function ClearForm({ subject, status, onDone, stewardReason }: { subject: AiSubject; status: AiStatus; onDone: () => void; stewardReason?: string }) {
  const [reason, setReason] = useState('');
  const d = subject.disclosure!;
  const r = reason.trim();
  const unmet = [
    ...(r.length < 12 ? ['say why, in at least 12 characters'] : []),
    ...(r.length >= 12 && r.toLowerCase() === subject.subject.name.trim().toLowerCase() ? [`the reason is the ${subject.subject.kind}'s name; say why`] : []),
  ];
  const path = subject.subject.kind === 'account'
    ? `/api/research-ai/institutions/${subject.subject.id}/clearances` : `/api/research-ai/industries/${subject.subject.id}/clearances`;
  return (
    <GovernedForm<{ clearance_id: string }>
      path={path} provenanceLabel="What this records" disabledReason={stewardReason}
      provenance={<p className="m-0 text-[12.5px] text-ink">The steward's clearance of this {subject.subject.kind} for research with {status.model?.label}, with your reason. It keeps the disclosure below exactly as shown. It is withdrawn by a new row, never edited.</p>}
      fields={
        <div className="flex flex-col gap-3">
          <div><span className={LABEL}>The disclosure</span><p className={QUOTE} data-testid="ai-disclosure">{d.text}</p></div>
          <label className="block"><span className={LABEL}>Why it may be researched with Claude (for an account: where the client's agreement allows it)</span>
            <textarea rows={3} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="ai-clear-reason" /></label>
        </div>
      }
      canSubmit={unmet.length === 0} unmet={unmet}
      confirm={
        <span data-testid="confirm-text">
          Clear {subject.subject.name} ({subject.subject.id.slice(0, 8)}) for research with {status.model?.label} ({d.model}), with this disclosure:
          {' '}&ldquo;{d.text}&rdquo; and this reason: &ldquo;{r}&rdquo;. Final: it is withdrawn by a new row.
        </span>
      }
      buildBody={() => ({ reason: r, disclosure_sha256: d.sha256 })}
      submitLabel="Clear this for research with Claude"
      onSuccess={onDone}
      renderSuccess={(x) => <>Cleared ({short(x.clearance_id)}).</>}
    />
  );
}

function WithdrawForm({ subject, onDone, stewardReason }: { subject: AiSubject; onDone: () => void; stewardReason?: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const k = subject.current_clearance!;
  const r = reason.trim();
  if (!open) {
    return <button type="button" className={'mt-2 border border-silver px-2.5 py-1 text-[9.5px] font-semibold uppercase tracking-[.1em] text-ink-45 hover:border-ink hover:text-ink ' + FOCUS_RING}
      disabled={Boolean(stewardReason)} title={stewardReason} onClick={() => setOpen(true)} data-testid="ai-withdraw-open">Withdraw the clearance…</button>;
  }
  const unmet = [
    ...(r.length < 12 ? ['say why it is withdrawn, in at least 12 characters'] : []),
    ...(r.length >= 12 && r.toLowerCase() === k.reason.trim().toLowerCase() ? ["the reason repeats the clearance's own; say why it is withdrawn"] : []),
  ];
  return (
    <div className="mt-2 border-t border-rule-soft pt-2" data-testid="ai-withdraw">
      <GovernedForm<{ withdrawal_id: string }>
        path={`/api/research-ai/clearances/${k.id}/withdraw`} provenanceLabel="What this records" disabledReason={stewardReason}
        provenance={<p className="m-0 text-[12.5px] text-ink">A withdrawal, a new row naming the clearance. Nothing more is sent for this {subject.subject.kind} until it is cleared again.</p>}
        fields={<label className="block"><span className={LABEL}>Why it is withdrawn</span>
          <textarea rows={2} className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="ai-withdraw-reason" /></label>}
        canSubmit={unmet.length === 0} unmet={unmet}
        confirm={<span data-testid="confirm-text">Withdraw the clearance of {subject.subject.name} ({k.id.slice(0, 8)}), given by {k.person} on {when(k.at)} with the reason &ldquo;{k.reason}&rdquo;, with this reason: &ldquo;{r}&rdquo;. Final.</span>}
        buildBody={() => ({ reason: r })}
        submitLabel="Withdraw the clearance"
        onSuccess={onDone}
        renderSuccess={() => <>Withdrawn.</>}
      />
    </div>
  );
}

function SendForm({ subject, status, onDone }: { subject: AiSubject; status: AiStatus; onDone: () => void }) {
  const p = subject.prompts.find((x) => !x.sent);
  const k = subject.current_clearance;
  const m = status.model!;
  if (!p) return <p className="m-0 text-[12.5px] text-ink-45" data-testid="ai-no-prompt">Generate a prompt first: each prompt is sent at most once.</p>;
  const blocking = subject.customer_side_rows;
  const unmet = [
    ...(k ? [] : [`clear this ${subject.subject.kind} for research with ${m.label} first`]),
    ...(blocking.length ? [`the prompt would still carry ${blocking.length === 1 ? 'a row' : `${blocking.length} rows`} not published (below): the pinned entity cannot be left out; correct it by supersession, then generate a new prompt`] : []),
    ...(subject.calls_today >= subject.daily_limit ? [`today's limit (${subject.daily_limit}) is reached`] : []),
  ];
  const caps = status.caps;
  return (
    <GovernedForm<{ call_id: string }>
      path={`/api/research-ai/prompts/${p.id}/calls`} provenanceLabel="What this sends"
      provenance={<p className="m-0 text-[12.5px] text-ink">Prompt {short(p.id)}, exactly as stored, to {m.label}, which researches it with web search and web fetch. The call is recorded before it leaves and when it returns. It takes minutes; you can leave the page.</p>}
      fields={
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[12.5px]" data-testid="ai-send-summary">
          <dt className="text-ink-45">Prompt</dt><dd className="m-0 font-mono text-[11.5px]">{p.id} · SHA-256 {p.prompt_sha256}</dd>
          <dt className="text-ink-45">Model</dt><dd className="m-0">{m.label} ({m.id})</dd>
          <dt className="text-ink-45">Cleared</dt><dd className="m-0">{k ? `by ${k.person}, ${when(k.at)} (${short(k.id)})` : 'not cleared'}</dd>
          <dt className="text-ink-45">Caps</dt><dd className="m-0">{caps.maxTokens.toLocaleString('en-GB')} output tokens, {caps.webSearchMaxUses} searches, {caps.webFetchMaxUses} fetches, {Math.round(caps.timeoutMs / 60000)} minutes; at most {usd(m.capped_call_usd)}</dd>
          <dt className="text-ink-45">This month</dt><dd className="m-0">{usd(status.month.spent_usd)} of {status.month.limit_usd === null ? 'no limit set' : usd(status.month.limit_usd)}</dd>
        </dl>
      }
      canSubmit={unmet.length === 0} unmet={unmet}
      confirm={
        <span data-testid="confirm-text">
          Send prompt {p.id.slice(0, 8)} (SHA-256 {p.prompt_sha256}) for {subject.subject.name} to {m.label} ({m.id}), relying on the clearance {k ? k.id.slice(0, 8) : '(none)'},
          with at most {caps.maxTokens.toLocaleString('en-GB')} output tokens, {caps.webSearchMaxUses} searches and {caps.webFetchMaxUses} fetches. This month: {usd(status.month.spent_usd)} of {status.month.limit_usd === null ? 'no limit' : usd(status.month.limit_usd)}.
          This sends the prompt shown above to Anthropic and cannot be called back.
        </span>
      }
      buildBody={() => ({})}
      submitLabel="Research with Claude"
      onSuccess={onDone}
      renderSuccess={(x) => <>Sent: call {short(x.call_id)}. Its answer appears below when it returns.</>}
    />
  );
}

function ImportAnswer({ call, parsePath, onDone }: { call: AiCall; parsePath: string; onDone: () => void }) {
  const r = call.result!;
  return (
    <GovernedForm<{ count: number; import_id: string }>
      path={parsePath} provenanceLabel="What this records"
      provenance={<p className="m-0 text-[12.5px] text-ink">The call's answer, parsed exactly as it came back, as a paste is. Each field is then reviewed below; nothing is accepted until a person accepts it.</p>}
      fields={<p className="m-0 text-[12px] text-ink-45">Answer of call {short(call.id)}: {r.answer_bytes?.toLocaleString('en-GB')} bytes, SHA-256 {r.answer_sha256}.</p>}
      canSubmit
      confirm={<span data-testid="confirm-text">Import the answer of call {call.id.slice(0, 8)} ({r.answer_bytes?.toLocaleString('en-GB')} bytes, SHA-256 {r.answer_sha256}) as AI-sourced research results, each pending review.</span>}
      buildBody={() => ({ call_id: r.id })}
      submitLabel="Import the answer"
      onSuccess={onDone}
      renderSuccess={(x) => <>{x.count} {x.count === 1 ? 'result' : 'results'} pending review.</>}
    />
  );
}

function CallRow({ call, parsePath, onDone }: { call: AiCall; parsePath: string; onDone: () => void }) {
  const r = call.result;
  return (
    <li className="border-b border-rule-soft py-2.5 last:border-b-0" data-testid="ai-call" data-call={call.id} data-state={call.state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[11.5px]">call {short(call.id)} · prompt {short(call.prompt_id)}</span>
        <Badge tone={call.state === 'answered' ? 'healthy' : call.state === 'running' ? 'neutral' : 'warning'}>{STATE_LABEL[call.state]}</Badge>
      </div>
      <p className="m-0 mt-0.5 text-[11.5px] text-ink-45">
        Sent by {call.person}, {when(call.sent_at)}, to {call.model}
        {r && <> · {r.usage ? `${r.usage.input_tokens.toLocaleString('en-GB')} in, ${(r.usage.output_tokens ?? 0).toLocaleString('en-GB')} out, ${r.usage.web_search_requests ?? 0} searches` : ''} · cost {usd(r.cost_usd)}</>}
        {r?.error_type && <> · {r.error_type}{r.http_status ? ` (HTTP ${r.http_status})` : ''}</>}
      </p>
      {call.import_id && <p className="m-0 mt-0.5 text-[11.5px] text-ink-45" data-testid="ai-imported">Imported ({short(call.import_id)}).</p>}
      {call.state === 'answered' && !call.import_id && <div className="mt-2"><ImportAnswer call={call} parsePath={parsePath} onDone={onDone} /></div>}
    </li>
  );
}

export function AiResearchCard({ kind, id, n, parsePath, onImported }: {
  kind: 'institution' | 'industry'; id: string; n: string; parsePath: string; onImported: () => void;
}) {
  const { actor } = useActor();
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [subject, setSubject] = useState<AiSubject | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAiStatus(), fetchAiSubject(kind, id)]).then(([s, j]) => {
      if (cancelled) return;
      if (!s.ok) { setMessage(s.message); return; }
      if (!j.ok) { setMessage(j.message); return; }
      setStatus(s.data); setSubject(j.data); setMessage(null);
    });
    return () => { cancelled = true; };
  }, [kind, id, tick]);
  const running = subject?.calls.some((c) => c.state === 'running');
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setTick((x) => x + 1), 5000);
    return () => clearTimeout(t);
  }, [running, tick]);
  const reload = () => setTick((x) => x + 1);
  const stewardReason = actor?.is_steward ? undefined : `This is the steward's act — ${actor?.steward_name ?? "the tenant's steward"}'s alone.`;

  return (
    <Card n={n} title="Research with Claude" badge={status ? <Badge tone={status.on ? 'healthy' : 'neutral'}>{status.on ? 'on' : 'off'}</Badge> : undefined}>
      <div data-testid="ai-research">
        {message ? <p className="m-0 text-[12.5px] text-critical">{message}</p> : !status || !subject ? <p className="m-0 text-ink-45">loading</p> : (
          <>
            {!status.on && <p className="m-0 mb-3 text-[12.5px] text-ink-45" data-testid="ai-off">{status.why}</p>}
            {subject.current_clearance ? (
              <div className="mb-3" data-testid="ai-cleared">
                <p className="m-0 text-[12.5px] text-ink">
                  Cleared for {subject.current_clearance.model} by {subject.current_clearance.person}, {when(subject.current_clearance.at)} ({short(subject.current_clearance.id)}): &ldquo;{subject.current_clearance.reason}&rdquo;
                </p>
                <p className={QUOTE + ' mt-2'} data-testid="ai-cleared-disclosure">{subject.current_clearance.disclosure_text}</p>
                <WithdrawForm subject={subject} onDone={reload} stewardReason={stewardReason} />
              </div>
            ) : subject.disclosure && status.model ? (
              <div className="mb-3" data-testid="ai-clear"><ClearForm subject={subject} status={status} onDone={reload} stewardReason={stewardReason} /></div>
            ) : null}
            {subject.left_out_rows.length > 0 && (
              <div className="mb-3 border-l-[3px] border-rule pl-3" data-testid="ai-left-out">
                <p className="m-0 text-[12.5px] text-ink">Left out of the prompt, never sent: {subject.left_out_rows.length === 1 ? 'a row' : `${subject.left_out_rows.length} rows`} on record that {subject.subject.name} does not publish. The prompt names only their kind, so research looks for each afresh in what the account publishes.</p>
                <ul className="m-0 mt-1 list-disc pl-5 text-[12px] text-ink">
                  {subject.left_out_rows.map((b) => <li key={b.id} data-testid="ai-left-out-row">{b.what} {b.label} ({short(b.id)}): {b.why}</li>)}
                </ul>
              </div>
            )}
            {subject.customer_side_rows.length > 0 && (
              <div className="mb-3 border-l-[3px] border-warning pl-3" data-testid="ai-customer-side">
                <p className="m-0 text-[12.5px] text-ink">Not sent while these stand: the prompt would still carry {subject.customer_side_rows.length === 1 ? 'a row' : 'rows'} that {subject.subject.name} does not publish, and the pinned entity cannot be left out.</p>
                <ul className="m-0 mt-1 list-disc pl-5 text-[12px] text-ink">
                  {subject.customer_side_rows.map((b) => <li key={b.id}>{b.what} {b.label} ({short(b.id)}): {b.why}</li>)}
                </ul>
              </div>
            )}
            {status.on && status.model && <div className="mb-3" data-testid="ai-send"><SendForm subject={subject} status={status} onDone={reload} /></div>}
            {subject.calls.length > 0 && (
              <ul className="m-0 list-none p-0" data-testid="ai-calls">
                {subject.calls.map((c) => <CallRow key={c.id} call={c} parsePath={parsePath} onDone={() => { reload(); onImported(); }} />)}
              </ul>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

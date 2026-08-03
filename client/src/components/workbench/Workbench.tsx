import { businessMetricName, type Run } from '../../types/run';
import { Rail } from './Rail';
import { Topbar } from './Topbar';
import { ProvenanceBanner } from './ProvenanceBanner';
import { Gate } from './Gate';
import { MeasurementRow } from './MeasurementRow';
import { EvidenceCard } from './EvidenceCard';
import { HeartbeatCard } from './HeartbeatCard';
import { HealthCard } from './HealthCard';
import { FindingsCard } from './FindingsCard';
import { ConfidenceInstrument } from './ConfidenceInstrument';

export function Workbench({ run }: { run: Run }) {
  const p = run.payload;

  return (
    <div>
      <ProvenanceBanner run={run} />

      <div className="flex min-h-screen">
        <Rail run={run} />

        <main className="min-w-0 flex-1">
          <Topbar run={run} />
          <Gate run={run} />

          <div className="px-[30px] pb-14 pt-6">
            <header className="mb-[22px]">
              <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-45">
                Realization Record · v1 · run {p.runNumber}
              </span>
              <h1 className="m-0 my-1.5 max-w-[22ch] font-display text-[40px] leading-[.98] tracking-[.012em]">
                {p.capability}
              </h1>
              <p className="m-0 max-w-[62ch] text-[13.5px] text-ink-70">
                {businessMetricName(p.businessMetric)}
              </p>
            </header>

            <MeasurementRow run={run} />
            <EvidenceCard run={run} />
            <HeartbeatCard run={run} />
            <HealthCard run={run} />
            <FindingsCard run={run} />
          </div>
        </main>

        <ConfidenceInstrument run={run} />
      </div>
    </div>
  );
}

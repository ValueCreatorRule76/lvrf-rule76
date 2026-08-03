import type { ReactNode } from 'react';

export function Card({
  n,
  title,
  badge,
  children,
}: {
  n: string;
  title: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 border border-rule bg-white">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-[11px]">
        <h3 className="m-0 font-display text-[15px] tracking-[.07em]">
          <span className="mr-1.5 text-gold">{n}</span>
          {title}
        </h3>
        {badge}
      </header>
      <div className="px-4 pb-4 pt-3.5">{children}</div>
    </section>
  );
}

export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'healthy' | 'warning' | 'critical' | 'failure' | 'watch' | 'neutral' | 'solid';
  children: ReactNode;
}) {
  const toneClass: Record<string, string> = {
    healthy: 'text-healthy border-healthy',
    warning: 'text-warning border-warning',
    critical: 'text-critical border-critical',
    failure: 'bg-failure text-offwhite border-failure',
    watch: 'text-gold-ink border-gold-ink',
    neutral: 'text-ink-45 border-ink-45',
    solid: 'bg-ink text-offwhite border-ink',
  };
  return (
    <span
      className={
        'inline-block whitespace-nowrap border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.1em] ' +
        toneClass[tone]
      }
    >
      {children}
    </span>
  );
}

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

type Tone = 'neutral' | 'accent' | 'positive' | 'negative';

const TONE: Record<Tone, string> = {
  neutral: 'border-border bg-surface-2 text-text-muted',
  accent: 'border-transparent bg-accent text-on-accent',
  positive: 'border-border bg-surface-2 text-positive',
  negative: 'border-border bg-surface-2 text-negative',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[11px] font-medium whitespace-nowrap', TONE[tone], className)}>
      {children}
    </span>
  );
}

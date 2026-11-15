import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Delta, type DeltaProps } from './Delta';
import { Skeleton } from './Skeleton';

interface StatTileProps {
  /** Sentence case, no colon: "Win rate". */
  label: string;
  /** Already formatted ("54.2%", or "–" for null). */
  value: ReactNode;
  /** A second line under the value, e.g. "Last season 52.0%". */
  sub?: ReactNode;
  /** The trend arrow beside the value; `label` names what it compares with ("vs last season"). */
  delta?: DeltaProps & { label?: string };
  loading?: boolean;
  /** Without its own border and padding, for tiles inside a card that already has them. */
  bare?: boolean;
  className?: string;
}

/** One headline number. The value uses proportional figures (it stands alone); the delta and sub-value are small. */
export function StatTile({ label, value, sub, delta, loading = false, bare = false, className }: StatTileProps) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-busy={loading || undefined}
      className={cn('flex min-w-0 flex-col gap-1', !bare && 'rounded-card border border-border bg-surface p-3', className)}
    >
      <div className="truncate text-xs font-medium text-text-muted">{label}</div>
      {loading ? (
        <>
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3.5 w-28" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="truncate text-xl leading-7 font-semibold text-text">{value}</span>
            {delta && <Delta {...delta} className="text-xs" />}
            {delta?.label && <span className="truncate text-xs text-text-muted">{delta.label}</span>}
          </div>
          {sub !== undefined && <div className="truncate text-xs text-text-muted tabular">{sub}</div>}
        </>
      )}
    </div>
  );
}

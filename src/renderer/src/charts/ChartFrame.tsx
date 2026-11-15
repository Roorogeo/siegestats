import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState, type ReactElement, type ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';
import { cn } from '../lib/cn';
import { Button, FLOATING_SHADOW } from '../ui';

interface ChartFrameProps {
  /** Accessible name of the figure: what is plotted ("Ranked points after every match"). */
  label: string;
  /** Height of the plot including its axes, in px. */
  height: number;
  /** One Recharts chart (LineChart, BarChart, ...); it gets the frame's width and height. */
  children: ReactElement;
  /** The same data as a table: every chart has one (dataviz rule: tooltips never gate a value). */
  table?: ReactNode;
  /** Re-fetching: the previous render stays, dimmed, instead of a skeleton flash. */
  busy?: boolean;
  className?: string;
}

/**
 * The wrapper every chart sits in: responsive width, a fixed height that includes the axes, a dimmed state while
 * data reloads and a "Table" toggle that swaps the plot for its table view. Colours come from charts/theme.ts.
 */
export function ChartFrame({ label, height, children, table, busy = false, className }: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const bodyId = useId();
  return (
    <figure aria-label={label} className={cn('m-0 flex min-w-0 flex-col gap-1', className)}>
      <div id={bodyId} className={cn('min-w-0 transition-opacity', busy && 'opacity-60')}>
        {asTable && table !== undefined ? (
          <div className="overflow-auto" style={{ height }}>
            {table}
          </div>
        ) : (
          <div style={{ height }} className="min-w-0 [&_.recharts-surface:focus:not(:focus-visible)]:outline-none">
            <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height }}>
              {children}
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {table !== undefined && (
        <Button
          variant="ghost"
          size="sm"
          className="self-end"
          aria-controls={bodyId}
          // The label says what a press does next, so no aria-pressed: "Show chart, pressed" would contradict it.
          onClick={() => setAsTable((on) => !on)}
          icon={asTable ? <BarChart3 className="size-3.5" aria-hidden /> : <Table2 className="size-3.5" aria-hidden />}
        >
          {asTable ? 'Show chart' : 'Show table'}
        </Button>
      )}
    </figure>
  );
}

/** The chart tooltip box: styled like a popover from theme tokens. Value first and strong, labels muted. */
export function TooltipCard({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className={cn('min-w-36 rounded-card border border-border bg-surface px-2.5 py-2 text-xs text-text', FLOATING_SHADOW)}>
      <div className="mb-1 text-text-muted tabular">{title}</div>
      {children}
    </div>
  );
}

import { useId, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { QueryState, type QueryLike, type QueryStateOptions } from './QueryState';

interface SectionCardBase {
  title: ReactNode;
  /** Small line under the title: the period, "Updated 3 min ago". */
  subtitle?: ReactNode;
  /** Controls on the right of the title row (a toggle, "View more"). */
  actions?: ReactNode;
  /** Body runs edge to edge (tables, charts with their own padding). */
  flush?: boolean;
  headingLevel?: 2 | 3;
  className?: string;
}

type SectionCardProps<T> = SectionCardBase &
  (
    | { query?: undefined; children: ReactNode }
    | ({ query: QueryLike<T>; children(data: T): ReactNode } & QueryStateOptions<T>)
  );

/**
 * A card with a title row (title, subtitle, actions) and a body. Given a query, the body is a QueryState: skeleton,
 * error with Retry, empty state or the data, so a screen section gets all four states by passing its query.
 */
export function SectionCard<T>(props: SectionCardProps<T>) {
  const { title, subtitle, actions, flush = false, headingLevel = 2, className } = props;
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  let body: ReactNode;
  if (props.query === undefined) {
    body = props.children;
  } else {
    const { query, children, skeleton, isEmpty, empty, errorTitle, idle, loadingLabel } = props;
    body = (
      <QueryState
        query={query}
        compact
        {...(skeleton === undefined ? {} : { skeleton })}
        {...(isEmpty === undefined ? {} : { isEmpty })}
        {...(empty === undefined ? {} : { empty })}
        {...(errorTitle === undefined ? {} : { errorTitle })}
        {...(idle === undefined ? {} : { idle })}
        {...(loadingLabel === undefined ? {} : { loadingLabel })}
      >
        {children}
      </QueryState>
    );
  }
  return (
    <section aria-labelledby={headingId} className={cn('flex min-w-0 flex-col rounded-card border border-border bg-surface', className)}>
      <header className="flex min-h-11 items-center gap-3 px-4 py-2">
        <div className="min-w-0">
          <Heading id={headingId} className="truncate text-[15px] leading-6 font-semibold text-text">
            {title}
          </Heading>
          {subtitle !== undefined && <p className="truncate text-xs text-text-muted">{subtitle}</p>}
        </div>
        {actions !== undefined && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      <div className={cn('min-w-0 flex-1', !flush && 'px-4 pb-4')}>{body}</div>
    </section>
  );
}

import { CircleSlash, CloudOff, SearchX, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppError } from '@shared/types/provider';
import { timeAgo } from '../lib/format';
import { cn } from '../lib/cn';
import { useNow } from '../lib/useNow';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { Loading, Skeleton } from './Skeleton';

/** The parts of a TanStack query result QueryState reads (UseQueryResult and UseInfiniteQueryResult both fit). */
export interface QueryLike<T> {
  data: T | undefined;
  error: AppError | null;
  status: 'pending' | 'error' | 'success';
  fetchStatus: 'fetching' | 'paused' | 'idle';
  isFetching: boolean;
  refetch: () => unknown;
}

export interface EmptyContent {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}

export interface QueryStateOptions<T> {
  /** Shown while the first answer loads; default three skeleton lines. */
  skeleton?: ReactNode;
  /** When the answer has nothing to show (no matches, no encounters): the empty state is shown instead. */
  isEmpty?(data: T): boolean;
  empty?: EmptyContent;
  /** Title of the error state; the AppError's message is its description. */
  errorTitle?: string;
  /** Shown while the query waits for input (it has no request yet); default nothing. */
  idle?: ReactNode;
  /** Name announced while loading. */
  loadingLabel?: string;
  /** Smaller vertical padding, for states inside a card. */
  compact?: boolean;
}

interface QueryStateProps<T> extends QueryStateOptions<T> {
  query: QueryLike<T>;
  children(data: T): ReactNode;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** The Fetched envelope of a stats answer (or of the first page of an infinite one), if the data is one. */
function fetchedOf(data: unknown): { fetchedAt: string; from: string } | null {
  if (!isRecord(data)) return null;
  if (typeof data.fetchedAt === 'string' && typeof data.from === 'string') return { fetchedAt: data.fetchedAt, from: data.from };
  if (Array.isArray(data.pages)) return fetchedOf(data.pages[0]);
  return null;
}

/** The error state for an AppError, worded by its code. Unavailable and not-found answers offer no retry. */
export function QueryError({ error, title, onRetry, compact = false }: { error: AppError; title?: string; onRetry?: () => void; compact?: boolean }) {
  const padding = cn(compact && 'py-6');
  if (error.code === 'unsupported' || error.code === 'not_configured') {
    return (
      <EmptyState
        icon={<CircleSlash className="size-5" aria-hidden />}
        title="Not available from this source"
        description={error.message}
        className={padding}
      />
    );
  }
  if (error.code === 'not_found') {
    return <EmptyState icon={<SearchX className="size-5" aria-hidden />} title="Not found" description={error.message} className={padding} />;
  }
  const wait = error.retryAfterSec !== null && error.retryAfterSec > 0 ? ` Try again in ${error.retryAfterSec} s.` : '';
  return (
    <ErrorState
      title={title ?? 'This could not be loaded'}
      description={`${error.message}${wait}`}
      {...(onRetry ? { onRetry } : {})}
      {...(compact ? { className: '[&>div]:py-6' } : {})}
    />
  );
}

function DefaultSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-1">
      <Skeleton className="h-4 w-2/5" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

/** A refresh failed but older data is still on screen: say so in one line, with Retry. */
function RefreshFailed({ error, onRetry }: { error: AppError; onRetry: () => void }) {
  return (
    <div role="alert" className="mb-2 flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted">
      <TriangleAlert className="size-3.5 shrink-0 text-negative" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Could not refresh: {error.message}</span>
      <Button size="sm" variant="ghost" className="h-6" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/** The source failed and core answered from its cache: the data is older than it looks. */
function StaleNotice({ fetchedAt }: { fetchedAt: string }) {
  const now = useNow();
  return (
    <div role="status" className="mb-2 flex items-center gap-2 rounded-control border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted">
      <CloudOff className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">The stats source cannot be reached. Showing saved data from {timeAgo(fetchedAt, now)}.</span>
    </div>
  );
}

/**
 * One component for the brief's "loading skeletons, empty states and error states" on every screen. Given a query
 * result it renders, in order: the data (children), with a notice if a refresh failed or the answer is a stale cached
 * copy; the empty state when isEmpty says so; the error state (Retry calls refetch; "not available from this source"
 * for unsupported calls); the idle slot for a query still waiting for input; otherwise the loading skeleton.
 */
export function QueryState<T>({
  query, children, skeleton, isEmpty, empty, errorTitle, idle, loadingLabel = 'Loading', compact = false,
}: QueryStateProps<T>) {
  const { data, error } = query;
  const retry = (): void => void query.refetch();

  if (data !== undefined) {
    const fetched = fetchedOf(data);
    const notices = (
      <>
        {error && !query.isFetching && <RefreshFailed error={error} onRetry={retry} />}
        {fetched?.from === 'stale_cache' && <StaleNotice fetchedAt={fetched.fetchedAt} />}
      </>
    );
    if (isEmpty?.(data)) {
      return (
        <>
          {notices}
          <EmptyState
            title={empty?.title ?? 'Nothing to show'}
            description={empty?.description}
            icon={empty?.icon}
            action={empty?.action}
            className={cn(compact && 'py-6')}
          />
        </>
      );
    }
    return (
      <>
        {notices}
        {children(data)}
      </>
    );
  }
  if (query.status === 'error' && error && !query.isFetching) {
    return <QueryError error={error} onRetry={retry} compact={compact} {...(errorTitle ? { title: errorTitle } : {})} />;
  }
  if (query.status === 'pending' && query.fetchStatus === 'idle') return <>{idle ?? null}</>;
  return <Loading label={loadingLabel}>{skeleton ?? <DefaultSkeleton />}</Loading>;
}

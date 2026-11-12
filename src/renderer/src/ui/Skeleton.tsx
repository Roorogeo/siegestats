import { cn } from '../lib/cn';

/** A placeholder block shown while data loads. Size it with width / height classes. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-shimmer rounded-control bg-surface-2', className)} />;
}

/** Announces loading to screen readers; wrap a group of skeletons in it. */
export function Loading({ label = 'Loading', children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

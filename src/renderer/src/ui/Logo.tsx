import { cn } from '../lib/cn';

/**
 * The Sightline mark: two sightlines converging on a point. Drawn with theme tokens, so it follows the theme.
 * (Placeholder geometry; the final mark replaces this file.)
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-5', className)} role="img" aria-label="Sightline">
      <path d="M3 5 L17 12 L3 19" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19.5" cy="12" r="2.5" fill="var(--accent-2)" />
    </svg>
  );
}

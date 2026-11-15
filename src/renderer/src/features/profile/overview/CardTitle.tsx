import type { ReactNode } from 'react';

/**
 * A section title at the profile's 15 px title size. SectionCard's own heading is 13 px; this sits inside it, so the
 * heading element and its level stay SectionCard's.
 */
export function CardTitle({ children }: { children: ReactNode }) {
  return <span className="text-[15px] leading-6">{children}</span>;
}

/** A small heading inside a card ("Best operators", "By playlist"). */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-medium text-text-muted">{children}</h3>;
}

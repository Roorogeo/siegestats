import type { ReactNode } from 'react';

/** A small heading inside a card ("Best operators", "By playlist"). */
export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-medium text-text-muted">{children}</h3>;
}

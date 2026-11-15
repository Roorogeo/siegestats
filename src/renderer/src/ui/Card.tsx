import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Removes the default padding, for tables and media that run edge to edge. */
  flush?: boolean;
}

export function Card({ children, flush = false, className, ...rest }: CardProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface', !flush && 'p-4', className)} {...rest}>
      {children}
    </div>
  );
}

/** A card's title, at SectionCard's title size. */
export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('text-[15px] leading-6 font-semibold text-text', className)}>{children}</h2>;
}

import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  /** A button or link that moves the user forward. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      {icon && <div className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-text-muted">{icon}</div>}
      <div className="space-y-1">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {description && <p className="mx-auto max-w-md text-[13px] text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

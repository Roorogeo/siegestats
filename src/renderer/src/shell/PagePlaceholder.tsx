import type { ReactNode } from 'react';
import { Badge, Card, EmptyState } from '../ui';

interface PagePlaceholderProps {
  /** Page title, as on its tab. */
  title: string;
  /** One line: what the screen will show. */
  description: string;
  /** The phase of the brief that builds this screen. */
  phase: number;
  icon: ReactNode;
  emptyTitle: string;
  emptyDescription: string;
}

/** A tab page that is not built yet: its real header, and an empty state that says when it arrives. */
export function PagePlaceholder({ title, description, phase, icon, emptyTitle, emptyDescription }: PagePlaceholderProps) {
  return (
    <div className="flex flex-col gap-5 px-6 py-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-lg font-semibold">{title}</h1>
          <Badge>Phase {phase}</Badge>
        </div>
        <p className="text-[13px] text-text-muted">{description}</p>
      </header>
      <Card>
        <EmptyState icon={icon} title={emptyTitle} description={emptyDescription} className="py-16" />
      </Card>
    </div>
  );
}

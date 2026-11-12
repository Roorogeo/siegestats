import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  onReportBug?: () => void;
  className?: string;
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, onReportBug, className }: ErrorStateProps) {
  const actions = (onRetry || onReportBug) && (
    <div className="flex items-center gap-2">
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Retry
        </Button>
      )}
      {onReportBug && <Button onClick={onReportBug}>Report a bug</Button>}
    </div>
  );
  return (
    <div role="alert" className={className}>
      <EmptyState icon={<TriangleAlert className="size-5 text-negative" aria-hidden />} title={title} description={description} action={actions} />
    </div>
  );
}

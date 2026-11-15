import { ChevronDown, ChevronUp } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';

export interface ShowMoreState<T> {
  /** The items to render now. */
  visible: readonly T[];
  /** How many are hidden while collapsed. */
  hiddenCount: number;
  expanded: boolean;
  toggle(): void;
}

/** For lists that are not plain lists (a DataTable's rows): slice with this, render <ShowMoreButton> under it. */
export function useShowMore<T>(items: readonly T[], initial: number): ShowMoreState<T> {
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = Math.max(0, items.length - initial);
  return {
    visible: expanded || hiddenCount === 0 ? items : items.slice(0, initial),
    hiddenCount,
    expanded,
    toggle: () => setExpanded((open) => !open),
  };
}

interface ShowMoreButtonProps {
  state: ShowMoreState<unknown>;
  /** id of the element whose content grows (aria-controls). */
  controls?: string;
  /** "Show 12 more playlists": what the items are. */
  noun?: string;
  className?: string;
}

/** "Show 12 more" / "Show less". Renders nothing when nothing is hidden. */
export function ShowMoreButton({ state, controls, noun, className }: ShowMoreButtonProps) {
  if (state.hiddenCount === 0) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={state.expanded}
      aria-controls={controls}
      onClick={state.toggle}
      className={className}
      icon={state.expanded ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
    >
      {state.expanded ? 'Show less' : `Show ${state.hiddenCount} more${noun ? ` ${noun}` : ''}`}
    </Button>
  );
}

interface ShowMoreProps<T> {
  items: readonly T[];
  /** How many show while collapsed. */
  initial: number;
  children(item: T, index: number): ReactNode;
  itemKey(item: T, index: number): string;
  noun?: string;
  /** Accessible name of the list. */
  label?: string;
  className?: string;
  listClassName?: string;
}

/** A list that shows its first `initial` items and a "Show N more" button for the rest. */
export function ShowMore<T>({ items, initial, children, itemKey, noun, label, className, listClassName }: ShowMoreProps<T>) {
  const state = useShowMore(items, initial);
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <ul id={id} aria-label={label} className={cn('flex flex-col', listClassName)}>
        {state.visible.map((item, index) => (
          <li key={itemKey(item, index)}>{children(item, index)}</li>
        ))}
      </ul>
      <ShowMoreButton state={state} controls={id} {...(noun === undefined ? {} : { noun })} className="self-start" />
    </div>
  );
}

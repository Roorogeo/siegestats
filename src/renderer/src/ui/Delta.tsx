import { ArrowDown, ArrowUp } from 'lucide-react';
import { DASH, formatDelta, formatNumber } from '../lib/format';
import { cn } from '../lib/cn';

export interface DeltaProps {
  /** The change; null = unknown (an en dash). */
  value: number | null;
  /** Writes the magnitude (gets the absolute value); default thousands separators. */
  format?: (magnitude: number) => string;
  /** Which direction is good news: 'up' (default, e.g. RP, win rate), 'down' (e.g. deaths), 'none' (no colour). */
  good?: 'up' | 'down' | 'none';
  /** Said after the number to screen readers, e.g. "RP": "up 24 RP". */
  unit?: string;
  className?: string;
}

/**
 * A signed change with an arrow: "▲ +24". Colour says whether it is good news, and the arrow and the sign carry the
 * direction without colour. Screen readers hear "up 24" / "down 18" / "no change".
 */
export function Delta({ value, format = (n) => formatNumber(n), good = 'up', unit, className }: DeltaProps) {
  const text = formatDelta(value, format);
  const direction = value === null || text === DASH || !/^[+-]/.test(text) ? 0 : Math.sign(value);
  const tone =
    direction === 0 || good === 'none'
      ? 'text-text-muted'
      : (direction > 0) === (good === 'up')
        ? 'text-positive'
        : 'text-negative';
  const magnitude = value === null ? '' : format(Math.abs(value));
  const spoken =
    value === null ? 'unknown' : direction === 0 ? 'no change' : `${direction > 0 ? 'up' : 'down'} ${magnitude}${unit ? ` ${unit}` : ''}`;
  const Arrow = direction > 0 ? ArrowUp : direction < 0 ? ArrowDown : null;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium whitespace-nowrap tabular', tone, className)}>
      <span aria-hidden className="inline-flex items-center gap-0.5">
        {Arrow && <Arrow className="size-3 shrink-0" strokeWidth={2.5} />}
        {text}
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}

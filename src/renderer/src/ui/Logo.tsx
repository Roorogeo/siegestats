import { useId } from 'react';
import { cn } from '../lib/cn';

interface LogoProps {
  /** Size and placement. Without a size utility (size-*, w-*, h-*) the mark is size-5 (20 px). */
  className?: string;
  /**
   * Accessible name (role="img"). Pass an empty string where the name is already written next to the mark,
   * such as the title bar; the mark is then hidden from assistive technology so the name is not read twice.
   */
  title?: string;
}

const SIZED = /(?:^|[\s:])(?:size|w|h)-/;

/**
 * The Sightline mark: a viewer (the dot) and its field of view (the fan), whose edges converge on the viewer:
 * a line of sight, drawn as two plain shapes on the 45° diagonal.
 * Painted only with theme tokens, so it follows every theme: accent at the viewer, running into accent-2 across the fan.
 * The geometry (24 grid) is shared with the static app icon, resources/icon.svg; keep the two in step.
 */
export function Logo({ className, title = 'Sightline' }: LogoProps) {
  // One gradient per instance: several logos on a page must not share (or clash on) an id.
  const gradientId = `${useId()}sightline`;
  const paint = `url(#${gradientId})`;
  const named = title !== '';
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn(!SIZED.test(className ?? '') && 'size-5', 'shrink-0', className)}
      role={named ? 'img' : undefined}
      aria-label={named ? title : undefined}
      aria-hidden={named ? undefined : true}
    >
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="6" y1="18" x2="16.5" y2="7.5">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <circle cx="6" cy="18" r="3.6" fill={paint} />
      <path
        d="M9.89 14.11L21.24 11.7A11.6 11.6 0 0 0 12.3 2.76Z"
        fill={paint}
        stroke={paint}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** The page's h1 in main, which the shell focuses after a screen change (AppShell). */
export const focusPageHeading = (): void => {
  const active = document.activeElement;
  if (active !== null && active !== document.body) return;
  document.querySelector<HTMLElement>('main h1')?.focus({ preventScroll: true });
};

/**
 * A page's h1 while the page loads, for screen readers only. Like every page h1 it takes focus from code only
 * (tabIndex -1), as the shell moves focus to it after a screen change. When the loaded page (or its error) replaces
 * it while it has focus, the focus moves on to the h1 that takes its place instead of dropping to the document.
 */
export function LoadingHeading({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      // The cleanup runs while the heading is still in the document; the new h1 is there once the commit is done.
      if (node !== null && document.activeElement === node) queueMicrotask(focusPageHeading);
    };
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="sr-only outline-none">
      {children}
    </h1>
  );
}

import { useEffect, useLayoutEffect, useRef, type RefObject, type UIEvent } from 'react';
import { Outlet, useLocation, useNavigationType } from 'react-router';
import { setOpenTab, tabForPath } from '../app/tab-dots';
import { TabBar } from './TabBar';
import { TitleBar } from './TitleBar';
import { useGlobalShortcuts } from './useGlobalShortcuts';

/**
 * <main> is the only scroll container, so the browser's own scroll handling never applies to it. A new screen (a new
 * path) opens at the top; Back and Forward return to the offset the screen was left at. A tab or filter change (the
 * query string) keeps the position. Offsets are kept per history entry, for this session only.
 */
function usePageScroll(mainRef: RefObject<HTMLElement | null>): (event: UIEvent<HTMLElement>) => void {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const offsets = useRef(new Map<string, number>());
  const entry = useRef(key);
  const shownPath = useRef(pathname);

  useLayoutEffect(() => {
    entry.current = key;
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // A screen whose content is still loading is shorter: the browser then stops at its end.
    mainRef.current?.scrollTo(0, navigationType === 'POP' ? (offsets.current.get(key) ?? 0) : 0);
  }, [mainRef, pathname, key, navigationType]);

  return (event) => {
    offsets.current.set(entry.current, event.currentTarget.scrollTop);
  };
}

/**
 * After a screen change, focus goes to the new page's h1 (tabIndex -1 on every page h1), or to <main> while the page
 * has none, but only when focus was lost: the element that had it went with the old page, or a search pick left the
 * field. A control that stays on screen (Back and Forward in the title bar, a tab, a filter) keeps it.
 */
function usePageFocus(mainRef: RefObject<HTMLElement | null>): void {
  const { key } = useLocation();
  const shownKey = useRef(key);
  useEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    const main = mainRef.current;
    const active = document.activeElement;
    if (main === null || (active !== null && active !== document.body)) return;
    const heading = main.querySelector<HTMLElement>('h1');
    heading?.focus({ preventScroll: true });
    if (heading === null || document.activeElement !== heading) main.focus({ preventScroll: true });
  }, [mainRef, key]);
}

/**
 * The window: a 40px title bar, a 44px tab row, and the routed page filling the rest. Only the page
 * scrolls; the shell itself never does.
 */
export function AppShell() {
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  useGlobalShortcuts(searchRef);

  const openTab = tabForPath(useLocation().pathname);
  useEffect(() => setOpenTab(openTab), [openTab]);
  const onScroll = usePageScroll(mainRef);
  usePageFocus(mainRef);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-bg text-text">
      <TitleBar searchRef={searchRef} />
      <TabBar />
      {/* tabIndex -1: focusable from code only, as the fallback target after a screen change. */}
      <main ref={mainRef} tabIndex={-1} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto outline-none">
        <Outlet />
      </main>
    </div>
  );
}

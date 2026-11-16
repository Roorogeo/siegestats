import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { useLocation, useNavigationType } from 'react-router';

/**
 * How to find a focused control again when its page is shown anew: the n-th match of a selector built from it, with
 * the same text unless `text` is null.
 */
interface ControlRef {
  selector: string;
  index: number;
  text: string | null;
}

/** What a history entry's page had when the entry was left. */
interface LeftPage {
  top: number;
  focus: ControlRef | null;
}

/** How long Back and Forward keep looking for the control that had focus, while the page's data is on its way. */
const RESTORE_WINDOW_MS = 1000;

/**
 * The attributes that tell controls apart. A link by its target and role, not its name or text: those can carry a
 * relative time ("View match: …, 5 min ago") that changes while the page is away. Any other control by its name and
 * role, and its text (findControl).
 */
const LINK_IDENTIFYING = ['href', 'role'] as const;
const IDENTIFYING = ['aria-label', 'role'] as const;

/** Null for what is not a control of the page: nothing, something outside <main>, or what focusPage focuses anyway. */
function describeControl(main: HTMLElement, element: Element | null): ControlRef | null {
  if (element === null || element === main || element.localName === 'h1' || !main.contains(element)) return null;
  const link = element.hasAttribute('href');
  const attributes = (link ? LINK_IDENTIFYING : IDENTIFYING).filter((name) => element.hasAttribute(name));
  const selector = element.localName + attributes.map((name) => `[${name}="${CSS.escape(element.getAttribute(name) ?? '')}"]`).join('');
  const text = link ? null : (element.textContent ?? '');
  return { selector, index: [...main.querySelectorAll(selector)].indexOf(element), text };
}

/**
 * The same control on the page shown now. A link's target is enough; for any other control the text check keeps a
 * loading placeholder, or another control at that place, from passing for it.
 */
function findControl(main: HTMLElement, control: ControlRef): HTMLElement | null {
  const element = main.querySelectorAll<HTMLElement>(control.selector)[control.index];
  return element !== undefined && (control.text === null || element.textContent === control.text) ? element : null;
}

/**
 * Whether no control has focus: it is on the document, on what only a screen change focuses (<main>, or a page h1,
 * which a loading page's h1 also hands focus on to when the page is left before it loaded), or on a control the
 * navigation disabled (title-bar Back on reaching the first entry), which the browser is about to drop to the document.
 */
function focusLost(main: HTMLElement): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || active === main) return true;
  return (active.localName === 'h1' && main.contains(active)) || active.matches(':disabled');
}

/**
 * The page's h1 (tabIndex -1 on every page h1), or <main> while the page has none. <main> is focusable only until it
 * loses focus or is clicked (pointerdown comes before the click's focus change): with a tabIndex a click on any text
 * would focus it, and the next Tab would start again from the top of the page instead of after the click.
 */
function focusPage(main: HTMLElement): void {
  const heading = main.querySelector<HTMLElement>('h1');
  heading?.focus({ preventScroll: true });
  if (heading !== null && document.activeElement === heading) return;
  const listening = new AbortController();
  const release = (): void => {
    main.removeAttribute('tabindex');
    listening.abort();
  };
  main.tabIndex = -1;
  main.addEventListener('blur', release, { signal: listening.signal });
  main.addEventListener('pointerdown', release, { signal: listening.signal });
  main.focus({ preventScroll: true });
  if (document.activeElement !== main) release();
}

/**
 * Focuses `control`, or, while the page does not show it yet (data still on its way), the page's h1 until it does,
 * for up to RESTORE_WINDOW_MS. Stops as soon as a control has focus, or the user presses a key or the pointer (what
 * they do then decides where focus goes, even a click on blank space). Returns the cancel function.
 */
function restoreFocus(main: HTMLElement, control: ControlRef): () => void {
  const settled = (): boolean => {
    if (focusLost(main)) findControl(main, control)?.focus({ preventScroll: true });
    return !focusLost(main);
  };
  if (settled()) return () => undefined;
  focusPage(main);
  const listening = new AbortController();
  const observer = new MutationObserver(() => {
    if (settled()) stop();
  });
  const timer = window.setTimeout(() => stop(), RESTORE_WINDOW_MS);
  const stop = (): void => {
    observer.disconnect();
    window.clearTimeout(timer);
    listening.abort();
  };
  observer.observe(main, { childList: true, subtree: true });
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, stop, { capture: true, signal: listening.signal });
  return stop;
}

/**
 * The scroll offset and focused control of each history entry's page, kept for this session. Taken when the entry is
 * left, from the Navigation API's navigate event: it fires while the old page is still on screen, so the next page
 * cannot clamp the offset first, and an entry made by a query-string change is recorded even when it never scrolled.
 * Chromium, and so Electron, has the API; elsewhere nothing is recorded and Back opens at the top.
 */
function useLeftPages(mainRef: RefObject<HTMLElement | null>): RefObject<Map<string, LeftPage>> {
  const { key } = useLocation();
  const shown = useRef(key);
  const left = useRef(new Map<string, LeftPage>());
  /**
   * The control in <main> that focus last left for the title bar or tab row (Ctrl+K and the search, the usual way to
   * another player). Cleared when focus leaves for nowhere (a click on blank space): the place the user left then is
   * where they clicked, not that control.
   */
  const leftFrom = useRef<Element | null>(null);
  // Updated with the commit, so the key always names the page that is on screen.
  useLayoutEffect(() => {
    shown.current = key;
    leftFrom.current = null;
  }, [key]);
  useEffect(() => {
    const main = mainRef.current;
    if (main === null || !('navigation' in window)) return;
    const track = (event: FocusEvent): void => {
      const to = event.relatedTarget;
      if (to === null) leftFrom.current = null;
      else if (to instanceof Element && !main.contains(to) && event.target instanceof Element && describeControl(main, event.target) !== null) {
        leftFrom.current = event.target;
      }
    };
    /**
     * The control that has focus, or, while focus is outside the page (a search pick sends it from the title bar to
     * the document just before the navigation), the one in the page that focus left for the title bar.
     */
    const focusedControl = (): ControlRef | null => {
      const active = document.activeElement;
      if (active !== null && main.contains(active)) return describeControl(main, active);
      return leftFrom.current?.isConnected ? describeControl(main, leftFrom.current) : null;
    };
    const remember = (): void => {
      left.current.set(shown.current, { top: main.scrollTop, focus: focusedControl() });
    };
    main.addEventListener('focusout', track);
    window.navigation.addEventListener('navigate', remember);
    return () => {
      main.removeEventListener('focusout', track);
      window.navigation.removeEventListener('navigate', remember);
    };
  }, [mainRef]);
  return left;
}

/**
 * <main> is the only scroll container, so the browser's own scroll handling never applies to it. A new screen (a new
 * path) opens at the top; Back and Forward return to the offset the screen was left at. A tab or filter change (the
 * query string) keeps the position.
 */
function usePageScroll(mainRef: RefObject<HTMLElement | null>, left: RefObject<Map<string, LeftPage>>): void {
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const shownPath = useRef(pathname);
  useLayoutEffect(() => {
    if (shownPath.current === pathname) return;
    shownPath.current = pathname;
    // A screen whose content is still loading is shorter: the browser then stops at its end.
    mainRef.current?.scrollTo(0, navigationType === 'POP' ? (left.current.get(key)?.top ?? 0) : 0);
  }, [mainRef, left, pathname, key, navigationType]);
}

/**
 * After a screen change focus moves only when no control has it (focusLost): the element that had it went with the old
 * page, or a search pick left the field. A control that stays on screen (Back and Forward in the title bar, a tab, a
 * filter) keeps it. Back and Forward put it back on the control that had it when the entry was left, so the next Tab
 * goes on from the restored place; a new screen, or a control not found again, gives it to the page's h1.
 */
function usePageFocus(mainRef: RefObject<HTMLElement | null>, left: RefObject<Map<string, LeftPage>>): void {
  const { key } = useLocation();
  const navigationType = useNavigationType();
  const shownKey = useRef(key);
  useEffect(() => {
    if (shownKey.current === key) return;
    shownKey.current = key;
    const main = mainRef.current;
    if (main === null || !focusLost(main)) return;
    const control = navigationType === 'POP' ? left.current.get(key)?.focus : null;
    if (control) return restoreFocus(main, control);
    focusPage(main);
  }, [mainRef, left, key, navigationType]);
}

/** Scroll position and focus across screen changes, for the shell's <main>. */
export function usePageRestore(mainRef: RefObject<HTMLElement | null>): void {
  const left = useLeftPages(mainRef);
  usePageScroll(mainRef, left);
  usePageFocus(mainRef, left);
}

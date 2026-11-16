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

/** How long Back and Forward keep putting the page back, while its data (dropped from the query cache) is on its way. */
const RESTORE_WINDOW_MS = 3000;

/** Marks the element focusViewTop made focusable for the moment. */
const ANCHOR = 'data-focus-anchor';

/** A stop of the Tab order. (A negative tabIndex is focus from code only: an h1, a status line, a chart's insides.) */
const TAB_STOP = 'a[href], button, input, select, textarea, summary, [contenteditable="true"], [tabindex]:not([tabindex^="-"])';

/**
 * The attributes that tell controls apart. A link by its target and role, not its name or text: those can carry a
 * relative time ("View match: …, 5 min ago") that changes while the page is away. Any other control by its name and
 * role, and its text (findControl).
 */
const LINK_IDENTIFYING = ['href', 'role'] as const;
const IDENTIFYING = ['aria-label', 'role'] as const;

/**
 * Null for what is not a control of the page: nothing, something outside <main>, or what a screen change focuses anyway
 * (<main>, the h1, a focusViewTop anchor).
 */
function describeControl(main: HTMLElement, element: Element | null): ControlRef | null {
  if (element === null || element === main || element.localName === 'h1' || element.hasAttribute(ANCHOR) || !main.contains(element)) {
    return null;
  }
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

/** Whether `element` shows, at least in part, in <main>'s visible area. */
function inView(main: HTMLElement, element: Element): boolean {
  const view = main.getBoundingClientRect();
  const box = element.getBoundingClientRect();
  return box.bottom > view.top && box.top < view.bottom;
}

/**
 * Whether no control has focus: it is on the document, on what only a screen change focuses (<main>, a page h1, which
 * a loading page's h1 also hands focus on to when the page is left before it loaded, or a focusViewTop anchor), or on a
 * control the navigation disabled (title-bar Back on reaching the first entry), which the browser is about to drop.
 */
function focusLost(main: HTMLElement): boolean {
  const active = document.activeElement;
  if (active === null || active === document.body || active === main) return true;
  if (active.hasAttribute(ANCHOR)) return true;
  return (active.localName === 'h1' && main.contains(active)) || active.matches(':disabled');
}

/**
 * Makes `element` focusable from code until it loses focus or is clicked, focuses it, and cleans up. With `marker` set,
 * the stylesheet draws no ring on it (styles/index.css): an attribute React does not own, so a re-render of the
 * element (a new className) keeps it.
 */
function focusFor(element: HTMLElement, marker: string | null): void {
  const listening = new AbortController();
  const release = (): void => {
    element.removeAttribute('tabindex');
    if (marker !== null) element.removeAttribute(marker);
    listening.abort();
  };
  element.tabIndex = -1;
  if (marker !== null) element.setAttribute(marker, '');
  element.addEventListener('blur', release, { signal: listening.signal });
  // pointerdown comes before the click's focus change: a click on it would otherwise focus it.
  element.addEventListener('pointerdown', release, { signal: listening.signal });
  element.focus({ preventScroll: true });
  if (document.activeElement !== element) release();
}

/**
 * The page's h1 (tabIndex -1 on every page h1), or <main> while the page has none. <main> is focusable only for that
 * moment (focusFor): with a lasting tabIndex a click on any text would focus it, and the next Tab would start again from
 * the top of the page instead of after the click.
 */
function focusPage(main: HTMLElement): void {
  const heading = main.querySelector<HTMLElement>('h1');
  heading?.focus({ preventScroll: true });
  if (heading === null || document.activeElement !== heading) focusFor(main, null);
}

/** Parts of a table that a screen reader announces with no name ("row", "row group"): their cells are used instead. */
const TABLE_PARTS = new Set(['thead', 'tbody', 'tfoot', 'tr']);

/**
 * Where the next Tab goes on from when the page is shown below its top and no control is to have focus: the first
 * element, in page order, that is drawn starting in <main>'s visible area. A Tab stop is focused itself; anything else is
 * focusable for the moment (focusFor), even inside a focusable container that starts above the view (a tab panel): the
 * container would put the next Tab back at its own top. The h1 would be above the view, and so would that Tab.
 * Says what got focus: a control is where a Tab pressed now should stay (onViewTopTab), an anchor where it starts.
 */
function focusViewTop(main: HTMLElement): 'control' | 'anchor' | 'page' {
  if (main.scrollTop <= 0) {
    focusPage(main);
    return 'page';
  }
  const view = main.getBoundingClientRect();
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    // SVG too: a chart's plot is a keyboard stop (role application).
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue;
    const box = node.getBoundingClientRect();
    // Visually hidden text (sr-only: 1px, placed against the window) seems to be in view at any offset; skip it.
    if (box.width <= 1 || box.height <= 1 || box.top < view.top || box.top >= view.bottom) continue;
    // Focusable from code only: not a Tab stop, and its own tabindex must not be taken away by focusFor's release.
    if (node.hasAttribute('tabindex') && node.tabIndex < 0) continue;
    if (node.matches(TAB_STOP)) {
      node.focus({ preventScroll: true });
      if (document.activeElement === node) return 'control';
      continue;
    }
    if (!(node instanceof HTMLElement) || TABLE_PARTS.has(node.localName)) continue;
    focusFor(node, ANCHOR);
    if (document.activeElement === node) return 'anchor';
  }
  focusPage(main);
  return 'page';
}

/**
 * For a forward Tab that just moved focus to the top of the view: the browser's own Tab would then move past a control
 * focusViewTop chose, skipping the first control on screen, so it is held there. From an anchor the Tab goes ahead.
 */
function onViewTopTab(event: KeyboardEvent, placed: 'control' | 'anchor' | 'page' | null): void {
  if (placed === 'control' && event.key === 'Tab' && !event.shiftKey) event.preventDefault();
}

/**
 * Back and Forward: puts the page back as the entry was left. The offset (null: keep the current one) is set again
 * while the page grows: a page whose data is on its way starts shorter, and scrollTo stops at its end. When focus was
 * lost, it goes back to `control` once the page shows it, the h1 holding it meanwhile.
 *
 * It ends when both are done, after RESTORE_WINDOW_MS, or at the user's first input in the page. Then focus still
 * waiting goes to the top of the view (focusViewTop), and a restored control the page left outside the view is scrolled
 * into it, so the next Tab goes on from what is on screen. A key settles it that way first, so a Tab pressed while the
 * page is loading still starts there; the pointer, a touch or the wheel only ends it: what the user does then decides.
 * A shortcut (with Ctrl, Alt or Meta, or a modifier alone) is not input in the page: Ctrl+K moves focus to the title
 * bar, which ends the focus part by itself, and Alt+Left leaves the page, which cancels the restore.
 * `onEnd` runs once it is over; returns the cancel function.
 */
function restoreEntry(main: HTMLElement, top: number | null, control: ControlRef | null, moveFocus: boolean, onEnd: () => void): () => void {
  let scrolled = top === null;
  let focused = !moveFocus;
  const step = (): void => {
    if (top !== null && !scrolled) {
      main.scrollTo(0, top);
      scrolled = main.scrollTop >= top - 1;
    }
    if (!focused && control !== null) {
      if (focusLost(main)) findControl(main, control)?.focus({ preventScroll: true });
      focused = !focusLost(main);
    }
  };
  const settle = (): 'control' | 'anchor' | 'page' | null => {
    const placed = !focused && focusLost(main) ? focusViewTop(main) : null;
    const active = document.activeElement;
    if (moveFocus && active instanceof HTMLElement && active !== main && main.contains(active) && !inView(main, active)) {
      active.scrollIntoView({ block: 'nearest' });
    }
    return placed;
  };
  step();
  // Nothing to wait for: the control is back, or there is none and the offset is.
  if (scrolled && (focused || control === null)) {
    settle();
    onEnd();
    return () => undefined;
  }
  // The h1 holds focus while the page comes back: a screen reader hears which page it is.
  if (!focused) focusPage(main);

  const listening = new AbortController();
  const observer = new MutationObserver(() => {
    step();
    if (scrolled && (focused || control === null)) end(true);
  });
  const timer = window.setTimeout(() => end(true), RESTORE_WINDOW_MS);
  let over = false;
  const end = (settling: boolean): 'control' | 'anchor' | 'page' | null => {
    if (over) return null;
    over = true;
    observer.disconnect();
    window.clearTimeout(timer);
    listening.abort();
    const placed = settling ? settle() : null;
    onEnd();
    return placed;
  };
  observer.observe(main, { childList: true, subtree: true });
  const options = { capture: true, passive: true, signal: listening.signal };
  // Not passive: a Tab that settles focus on a control is held there (onViewTopTab).
  window.addEventListener('keydown', (event) => {
    if (!isShortcut(event)) onViewTopTab(event, end(true));
  }, { capture: true, signal: listening.signal });
  for (const type of ['pointerdown', 'touchstart', 'wheel'] as const) window.addEventListener(type, () => end(false), options);
  return () => end(false);
}

/** A key that is not input in the page: a modifier on its own, or a key pressed with Ctrl, Alt or Meta. */
function isShortcut(event: KeyboardEvent): boolean {
  return event.ctrlKey || event.altKey || event.metaKey || ['Control', 'Alt', 'AltGraph', 'Meta', 'Shift', 'CapsLock'].includes(event.key);
}

/**
 * The scroll offset and focused control of each history entry's page, kept for this session. Taken when the entry is
 * left, from the Navigation API's navigate event: it fires while the old page is still on screen, so the next page
 * cannot clamp the offset first, and an entry made by a query-string change is recorded even when it never scrolled.
 * Chromium, and so Electron, has the API; elsewhere nothing is recorded and Back opens at the top.
 */
function useLeftPages(mainRef: RefObject<HTMLElement | null>, restoring: RefObject<string | null>): RefObject<Map<string, LeftPage>> {
  const { key } = useLocation();
  const shown = useRef(key);
  const left = useRef(new Map<string, LeftPage>());
  /**
   * The control in <main> that focus last left for the title bar or tab row (Ctrl+K and the search, the usual way to
   * another player). Cleared when focus leaves for nowhere, or by any press in the page (a click on blank space while
   * focus is in the title bar): the place the user left then is where they clicked, not that control.
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
    const forget = (): void => {
      leftFrom.current = null;
    };
    /**
     * The control that has focus, or, while focus is outside the page (a search pick sends it from the title bar to
     * the document just before the navigation), the one in the page that focus left for the title bar. Only while it
     * is on screen: one the user scrolled away from is not where they were.
     */
    const focusedControl = (): ControlRef | null => {
      const active = document.activeElement;
      const element = active !== null && main.contains(active) ? active : leftFrom.current?.isConnected ? leftFrom.current : null;
      return element !== null && inView(main, element) ? describeControl(main, element) : null;
    };
    const remember = (): void => {
      // Left before Back or Forward finished putting it back (its data still on its way): what it was left with is
      // still the place to return to, not the half-loaded page.
      if (restoring.current === shown.current) return;
      left.current.set(shown.current, { top: main.scrollTop, focus: focusedControl() });
    };
    main.addEventListener('focusout', track);
    main.addEventListener('pointerdown', forget);
    window.navigation.addEventListener('navigate', remember);
    return () => {
      main.removeEventListener('focusout', track);
      main.removeEventListener('pointerdown', forget);
      window.navigation.removeEventListener('navigate', remember);
    };
  }, [mainRef, restoring]);
  return left;
}

/**
 * Scroll position and focus across screen changes, for the shell's <main>, the only scroll container (the browser's own
 * scroll handling never applies to it).
 * - A new screen (a new path) opens at the top. A tab or filter change (the query string) keeps the position.
 * - Back and Forward return to the offset the entry was left at, a tab or filter entry of the same screen included,
 *   and put focus back on the control that had it (restoreEntry).
 * - Focus moves only when no control has it (focusLost): the element that had it went with the old page, or a search
 *   pick left the field. A control that stays on screen (Back and Forward in the title bar, a tab, a filter) keeps it.
 *   A new screen gives it to its h1.
 * - A Tab pressed while focus is on what a screen change focused (the h1, <main>, an anchor) and the user has scrolled
 *   it out of view goes to the top of the view instead (focusViewTop), not on from far above it.
 */
export function usePageRestore(mainRef: RefObject<HTMLElement | null>): void {
  /** The key of the entry Back or Forward is still putting back, if any. */
  const restoring = useRef<string | null>(null);
  const left = useLeftPages(mainRef, restoring);
  const { pathname, key } = useLocation();
  const navigationType = useNavigationType();
  const shown = useRef({ pathname, key });

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const main = mainRef.current;
      const active = document.activeElement;
      // Forward only: Shift+Tab from the heading goes back to the tab row, as from any page's top.
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || main === null || active === null) return;
      const placeholder = active === main || active.hasAttribute(ANCHOR) || (active.localName === 'h1' && main.contains(active));
      if (placeholder && main.scrollTop > 0 && !inView(main, active)) onViewTopTab(event, focusViewTop(main));
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [mainRef]);

  useLayoutEffect(() => {
    const main = mainRef.current;
    const before = shown.current;
    if (main === null || before.key === key) return;
    shown.current = { pathname, key };
    const newPath = before.pathname !== pathname;
    const moveFocus = focusLost(main);
    if (navigationType !== 'POP') {
      if (newPath) main.scrollTo(0, 0);
      if (moveFocus) focusPage(main);
      return;
    }
    const entry = left.current.get(key);
    restoring.current = key;
    const top = entry?.top ?? (newPath ? 0 : null);
    return restoreEntry(main, top, entry?.focus ?? null, moveFocus, () => {
      if (restoring.current === key) restoring.current = null;
    });
  }, [mainRef, left, pathname, key, navigationType]);
}

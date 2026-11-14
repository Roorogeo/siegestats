import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { Link, useParams } from 'react-router';
import { SETTINGS_SECTIONS, settingsPath, type SettingsSection } from '../../app/routes';
import { cn } from '../../lib/cn';
import { ThemePicker } from '../themes/ThemePicker';
import { AboutSection } from './AboutSection';
import { AccountsSection, DataSection, GeneralSection, HotkeysSection } from './PlannedSection';
import { isSettingsSection, SECTION_META } from './sections';

const CONTENT: Record<SettingsSection, ComponentType> = {
  themes: ThemePicker,
  general: GeneralSection,
  accounts: AccountsSection,
  hotkeys: HotkeysSection,
  data: DataSection,
  about: AboutSection,
};

/**
 * Settings: the section list on the left (real links, so back / forward walk through sections), the section on
 * the right, scrolling on its own. /settings and unknown sections show Themes.
 */
export function SettingsPage() {
  const params = useParams();
  const section: SettingsSection = isSettingsSection(params.section) ? params.section : 'themes';
  const meta = SECTION_META[section];
  const Content = CONTENT[section];
  const scrollRef = useRef<HTMLDivElement>(null);

  // A new section starts at the top.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [section]);

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-52 shrink-0 flex-col border-r border-border">
        <h1 className="px-5 pt-5 pb-3 text-[18px] font-semibold text-text">Settings</h1>
        <nav aria-label="Settings sections" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <ul className="space-y-0.5">
            {SETTINGS_SECTIONS.map((id) => {
              const item = SECTION_META[id];
              const current = id === section;
              return (
                <li key={id}>
                  <Link
                    to={settingsPath(id)}
                    aria-current={current ? 'page' : undefined}
                    className={cn(
                      'relative flex h-8 items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors',
                      current ? 'bg-surface-2 font-medium text-text' : 'text-text-muted hover:bg-surface-2 hover:text-text',
                    )}
                  >
                    {current && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent-text" />}
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div ref={scrollRef} className="min-w-0 flex-1 scroll-pt-12 overflow-y-auto">
        <section aria-labelledby="settings-section-title" className="px-6 pt-5 pb-8">
          <header className="mb-4">
            <h2 id="settings-section-title" className="text-[15px] font-semibold text-text">
              {meta.label}
            </h2>
            <p className="text-[12px] text-text-muted">{meta.description}</p>
          </header>
          <Content />
        </section>
      </div>
    </div>
  );
}

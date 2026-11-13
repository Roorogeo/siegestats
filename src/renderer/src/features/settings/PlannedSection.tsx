import { CalendarClock, Eraser, Gamepad2, Monitor, MoveLeft, MoveRight, PanelBottom, Pin, Power, Search, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Platform } from '@shared/types/primitives';
import type { Hotkey, HotkeyAction } from '@shared/types/settings';
import { useSettings } from '../../app/SettingsProvider';
import { hotkeyParts } from '../../app/shortcuts';
import { Card, Kbd } from '../../ui';

interface PlannedItem {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Read-only: what is stored today. Never a control. */
  current?: ReactNode;
}

/**
 * A section whose settings arrive in phase 6 (docs/design.md, question 10). It lists exactly what will live
 * here, with what is stored today where that is useful, and offers no control that does nothing.
 */
const PHASE_NOTE = 'These settings arrive in phase 6. Nothing here can be changed yet.';

function PlannedSection({ items, note = PHASE_NOTE }: { items: readonly PlannedItem[]; note?: string }) {
  return (
    <Card flush className="max-w-2xl overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-4 py-2.5 text-[12px] text-text-muted">
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        <span>{note}</span>
      </div>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.title} className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control border border-border bg-surface-2 text-text-muted">
              <item.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-text">{item.title}</div>
              <p className="text-[12px] text-text-muted">{item.description}</p>
            </div>
            {item.current !== undefined && <div className="shrink-0 text-right text-[12px] text-text-muted">{item.current}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

const PLATFORM_LABEL: Record<Platform, string> = { pc: 'PC', psn: 'PlayStation', xbl: 'Xbox' };
const onOff = (on: boolean): string => (on ? 'on' : 'off');

export function GeneralSection() {
  const { settings } = useSettings();
  return (
    <PlannedSection
      items={[
        {
          icon: Gamepad2,
          title: 'Default platform',
          description: 'The platform player search starts on: PC, PlayStation or Xbox.',
          current: `Currently ${PLATFORM_LABEL[settings.defaultPlatform]}`,
        },
        {
          icon: Power,
          title: 'Launch on startup',
          description: 'Start Sightline with Windows, hidden in the tray.',
          current: `Currently ${onOff(settings.system.launchOnStartup)}`,
        },
        {
          icon: Monitor,
          title: 'Minimize to tray',
          description: 'Minimizing hides Sightline in the tray. Closing still quits.',
          current: `Currently ${onOff(settings.system.minimizeToTray)}`,
        },
      ]}
    />
  );
}

export function AccountsSection() {
  return (
    <PlannedSection
      items={[
        {
          icon: Pin,
          title: 'Pinned accounts',
          description: 'The accounts you pin as yours with "Pin as mine" on a profile. Reorder and remove them here.',
        },
      ]}
    />
  );
}

function Keys({ hotkey }: { hotkey: Hotkey | null }) {
  const parts = hotkeyParts(hotkey);
  if (parts.length === 0) return <span>Not set</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={parts.join(' + ')}>
      {parts.map((part) => (
        <Kbd key={part}>{part}</Kbd>
      ))}
    </span>
  );
}

const HOTKEYS: readonly { action: HotkeyAction; icon: LucideIcon; title: string; description: string }[] = [
  { action: 'focusSearch', icon: Search, title: 'Search', description: 'Jump to the player search in the title bar.' },
  { action: 'navigateBack', icon: MoveLeft, title: 'Back', description: 'Go to the previous screen.' },
  { action: 'navigateForward', icon: MoveRight, title: 'Forward', description: 'Go forward again after going back.' },
  { action: 'toggleOverlay', icon: PanelBottom, title: 'Overlay toggle', description: 'Show or hide the in-game overlay. No key by default.' },
];

export function HotkeysSection() {
  const { settings } = useSettings();
  return (
    <PlannedSection
      note="Rebinding, with a reset to the defaults, arrives in phase 6. Shown here: the keys stored now."
      items={HOTKEYS.map((h) => ({
        icon: h.icon,
        title: h.title,
        description: h.description,
        current: <Keys hotkey={settings.hotkeys[h.action]} />,
      }))}
    />
  );
}

export function DataSection() {
  return (
    <PlannedSection
      items={[
        {
          icon: Eraser,
          title: 'Clear cache',
          description:
            'Removes cached profile and leaderboard responses. Snapshots, saved matches, favourites and settings stay.',
        },
      ]}
    />
  );
}

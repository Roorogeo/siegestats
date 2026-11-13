import { Database, Info, Keyboard, Palette, SlidersHorizontal, Users, type LucideIcon } from 'lucide-react';
import { SETTINGS_SECTIONS, type SettingsSection } from '../../app/routes';

export interface SectionMeta {
  label: string;
  icon: LucideIcon;
  /** One line under the section heading. */
  description: string;
}

/** The left-hand list of the Settings screen, in SETTINGS_SECTIONS order. */
export const SECTION_META: Readonly<Record<SettingsSection, SectionMeta>> = {
  themes: {
    label: 'Themes',
    icon: Palette,
    description: 'Pick how Sightline looks. A theme applies at once and is saved.',
  },
  general: {
    label: 'General',
    icon: SlidersHorizontal,
    description: 'Start-up, tray and the platform search starts on.',
  },
  accounts: {
    label: 'Accounts',
    icon: Users,
    description: 'The accounts you pinned as yours.',
  },
  hotkeys: {
    label: 'Hotkeys',
    icon: Keyboard,
    description: 'Keyboard shortcuts for search, navigation and the overlay.',
  },
  data: {
    label: 'Data',
    icon: Database,
    description: 'What Sightline keeps on this computer.',
  },
  about: {
    label: 'About',
    icon: Info,
    description: 'Version, runtime and where to report a problem.',
  },
};

export const isSettingsSection = (value: string | undefined): value is SettingsSection =>
  (SETTINGS_SECTIONS as readonly string[]).includes(value ?? '');

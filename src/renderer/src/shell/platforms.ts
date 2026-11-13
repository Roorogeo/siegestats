import type { Platform } from '@shared/types/primitives';

export const PLATFORMS: readonly Platform[] = ['pc', 'psn', 'xbl'];

export const PLATFORM_LABEL: Readonly<Record<Platform, string>> = { pc: 'PC', psn: 'PlayStation', xbl: 'Xbox' };

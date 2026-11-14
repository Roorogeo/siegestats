import { describe, expect, test } from 'vitest';
import { createAppServices } from '@core/app-services';
import { createMemorySettingsStore } from '@core/memory/settings-store';
import { defaultSettings, MAX_PINNED_ACCOUNTS, normalizeSettings } from '@core/settings/defaults';
import { applySettingsPatch, createSettingsService } from '@core/settings/service';
import { defaultThemeSettings, selectTheme, setMatchSystem, themeMatchesQuery, toggleFavoriteTheme } from '@shared/theme';
import type { ThemeId } from '@shared/types/primitives';
import type { AppConfig } from '@shared/types/game-config';
import type { SettingsPatch } from '@shared/types/settings';

const id = (value: string): ThemeId => value as ThemeId;

describe('settings validation', () => {
  test('nothing on disk gives the defaults', () => {
    expect(normalizeSettings(null)).toEqual(defaultSettings());
    expect(normalizeSettings('garbage')).toEqual(defaultSettings());
  });

  test('defaults match the brief', () => {
    const d = defaultSettings();
    expect(d.theme.activeThemeId).toBe('graphite');
    expect(d.privacy.telemetryOptIn).toBe(false);
    expect(d.hotkeys.focusSearch).toEqual({ code: 'KeyK', ctrl: true, alt: false, shift: false });
    expect(d.hotkeys.navigateBack).toEqual({ code: 'ArrowLeft', ctrl: false, alt: true, shift: false });
    expect(d.hotkeys.navigateForward).toEqual({ code: 'ArrowRight', ctrl: false, alt: true, shift: false });
  });

  test('bad values fall back, unknown keys are dropped', () => {
    const s = normalizeSettings({
      theme: { activeThemeId: 'deleted-theme', favoriteThemeIds: ['ember', 'nope', 'ember'], matchSystem: 'yes' },
      defaultPlatform: 'switch',
      privacy: { telemetryOptIn: 'true' },
      somethingElse: 1,
    });
    expect(s.theme.activeThemeId).toBe('graphite');
    expect(s.theme.favoriteThemeIds).toEqual(['ember']);
    expect(s.theme.matchSystem).toBe(false);
    expect(s.defaultPlatform).toBe('pc');
    expect(s.privacy.telemetryOptIn).toBe(false);
    expect('somethingElse' in s).toBe(false);
  });

  test('the Windows pair only accepts generic themes of the right mode', () => {
    const s = normalizeSettings({ theme: { systemLightThemeId: 'midnight', systemDarkThemeId: 'ember' } });
    expect(s.theme.systemLightThemeId).toBe('daylight');
    expect(s.theme.systemDarkThemeId).toBe('graphite');
  });
});

describe('settings patches', () => {
  test('a patch replaces the given fields of a section and leaves the rest', () => {
    const next = applySettingsPatch(defaultSettings(), { system: { minimizeToTray: true } });
    expect(next.system).toEqual({ launchOnStartup: false, minimizeToTray: true });
    expect(next.theme).toEqual(defaultSettings().theme);
  });

  test('schemaVersion and unknown sections cannot be patched', () => {
    const patch = { schemaVersion: 9, nope: { a: 1 } } as unknown as SettingsPatch;
    expect(applySettingsPatch(defaultSettings(), patch)).toEqual(defaultSettings());
  });

  test('an invalid patch cannot store invalid settings', () => {
    const next = applySettingsPatch(defaultSettings(), { theme: { activeThemeId: id('not-a-theme') } });
    expect(next.theme.activeThemeId).toBe('graphite');
  });
});

describe('settings service', () => {
  test('saves, notifies subscribers and survives a restart', async () => {
    let disk: string | null = null;
    const persist = { read: () => disk, write: (json: string) => { disk = json; } };
    const first = createSettingsService(createMemorySettingsStore(persist));
    const seen: string[] = [];
    first.onChange((s) => seen.push(s.theme.activeThemeId));
    await first.update({ theme: { activeThemeId: id('ember') } });
    expect(seen).toEqual(['ember']);

    const second = createSettingsService(createMemorySettingsStore(persist));
    expect((await second.get()).theme.activeThemeId).toBe('ember');
  });
});

describe('theme picker rules', () => {
  const base = defaultThemeSettings();

  test('picking a theme makes it active', () => {
    expect(selectTheme(base, id('neon-district')).activeThemeId).toBe('neon-district');
  });

  test('with Match Windows on, a generic theme fills its own half of the pair', () => {
    const on = { ...base, matchSystem: true };
    expect(selectTheme(on, id('midnight'))).toMatchObject({ matchSystem: true, systemDarkThemeId: 'midnight', systemLightThemeId: 'daylight' });
  });

  test('with Match Windows on, a specialty theme switches matching off', () => {
    const on = { ...base, matchSystem: true };
    expect(selectTheme(on, id('ember'))).toMatchObject({ matchSystem: false, activeThemeId: 'ember' });
  });

  test('turning Match Windows off keeps what is on screen', () => {
    const on = { ...base, matchSystem: true, activeThemeId: id('ember'), systemDarkThemeId: id('slate') };
    expect(setMatchSystem(on, false, 'dark')).toMatchObject({ matchSystem: false, activeThemeId: 'slate' });
    expect(setMatchSystem(on, false, 'light')).toMatchObject({ matchSystem: false, activeThemeId: 'daylight' });
  });

  test('turning Match Windows on adopts a generic active theme', () => {
    expect(setMatchSystem({ ...base, activeThemeId: id('slate') }, true, 'dark')).toMatchObject({ matchSystem: true, systemDarkThemeId: 'slate' });
  });

  test('favourites toggle', () => {
    const once = toggleFavoriteTheme(base, id('ember'));
    expect(once.favoriteThemeIds).toEqual(['ember']);
    expect(toggleFavoriteTheme(once, id('ember')).favoriteThemeIds).toEqual([]);
  });

  test('search matches name, category and mode', () => {
    const ember = { name: 'Ember', category: 'elements', mode: 'dark' };
    expect(themeMatchesQuery(ember, '  emb ')).toBe(true);
    expect(themeMatchesQuery(ember, 'ELEMENTS')).toBe(true);
    expect(themeMatchesQuery(ember, 'light')).toBe(false);
    expect(themeMatchesQuery(ember, '')).toBe(true);
  });
});

describe('app services', () => {
  const config: AppConfig = { schemaVersion: 1, provider: 'mock', backendUrl: null, links: { bug_report: 'https://example.com/bugs', community: null } };
  const make = (opened: string[]) =>
    createAppServices({
      info: { name: 'Sightline', version: '0.0.0', runtime: 'browser', isDev: true },
      config,
      settingsStore: createMemorySettingsStore(),
      links: { open: async (url) => { opened.push(url); } },
    });

  test('only configured https links open', async () => {
    const opened: string[] = [];
    const services = make(opened);
    await services.app.openLink('bug_report');
    expect(opened).toEqual(['https://example.com/bugs']);
    await expect(services.app.openLink('community')).rejects.toMatchObject({ code: 'not_configured' });
    await expect(services.app.openLink('__proto__' as never)).rejects.toMatchObject({ code: 'not_configured' });
  });

  test('parts that are not built yet say so instead of failing silently', async () => {
    const services = make([]);
    await expect(services.live.getView()).rejects.toMatchObject({ code: 'unsupported' });
    await expect(services.stats.getProfile({ platform: 'pc', id: 'x' as never })).rejects.toMatchObject({ code: 'unsupported' });
    expect(await services.favorites.list()).toEqual([]);
  });
});

describe('settings saves', () => {
  test('concurrent updates are applied one after another, none is lost', async () => {
    const service = createSettingsService(createMemorySettingsStore());
    await Promise.all([
      service.update({ theme: { activeThemeId: id('ember') } }),
      service.update({ system: { minimizeToTray: true } }),
      service.update({ theme: { favoriteThemeIds: [id('glacier')] } }),
    ]);
    const s = await service.get();
    expect(s.theme.activeThemeId).toBe('ember');
    expect(s.theme.favoriteThemeIds).toEqual(['glacier']);
    expect(s.system.minimizeToTray).toBe(true);
  });

  test('a failed write changes nothing and does not block later saves', async () => {
    let fail = true;
    const memory = createMemorySettingsStore();
    const service = createSettingsService({ load: memory.load, save: async (s) => { if (fail) throw new Error('disk full'); await memory.save(s); } });
    const seen: string[] = [];
    service.onChange((s) => seen.push(s.theme.activeThemeId));
    await expect(service.update({ theme: { activeThemeId: id('ember') } })).rejects.toThrow('disk full');
    expect((await service.get()).theme.activeThemeId).toBe('graphite');
    expect(seen).toEqual([]);
    fail = false;
    await service.update({ theme: { activeThemeId: id('slate') } });
    expect((await service.get()).theme.activeThemeId).toBe('slate');
  });
});

describe('pinned accounts', () => {
  const pin = (id: string, extra: Record<string, unknown> = {}) => ({
    player: { platform: 'pc', id, name: `Player ${id}`, avatarUrl: null, ...extra },
    pinnedAt: '2026-11-01T00:00:00Z',
  });

  test('entries are rebuilt field by field; incomplete ones are dropped', () => {
    const s = normalizeSettings({
      accounts: {
        mock: {
          pinned: [
            pin('a', { secret: 'x'.repeat(10_000) }),
            { player: { platform: 'pc', id: 'b' }, pinnedAt: '2026-11-01T00:00:00Z' }, // no name
            pin('c', { platform: 'switch' }),
            { player: pin('d').player, pinnedAt: 'yesterday' },
            pin('a'), // duplicate
            pin('e', { avatarUrl: 'javascript:alert(1)' }),
          ],
          active: { platform: 'pc', id: 'a' },
        },
      },
    });
    expect(s.accounts.mock.pinned.map((p) => p.player.id)).toEqual(['a', 'e']);
    expect(s.accounts.mock.pinned[0]?.player).toEqual({ platform: 'pc', id: 'a', name: 'Player a', avatarUrl: null });
    expect(s.accounts.mock.pinned[1]?.player.avatarUrl).toBeNull();
    expect(s.accounts.mock.active).toEqual({ platform: 'pc', id: 'a' });
  });

  test('the list is capped and the active account must be one of the pins', () => {
    const many = Array.from({ length: 30 }, (_, i) => pin(`p${i}`));
    const s = normalizeSettings({ accounts: { mock: { pinned: many, active: { platform: 'pc', id: 'p29' } } } });
    expect(s.accounts.mock.pinned).toHaveLength(MAX_PINNED_ACCOUNTS);
    expect(s.accounts.mock.active).toBeNull();
  });
});

describe('theme search', () => {
  test('matches the category label shown on the tab', () => {
    const blueprint = { name: 'Blueprint', category: 'tactical', mode: 'dark' };
    expect(themeMatchesQuery(blueprint, 'tech')).toBe(true);
    expect(themeMatchesQuery({ name: 'Harvest', category: 'seasonal', mode: 'dark' }, 'mood')).toBe(true);
  });
});

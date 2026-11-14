import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const electronPath = require('electron') as unknown as string;

export interface LaunchedApp {
  app: ElectronApplication;
  page: Page;
  userData: string;
  close(): Promise<void>;
}

/** Starts the built app on a throwaway profile, or on `userData` to test what survives a restart. */
export async function launchApp(userData?: string, extraArgs: string[] = []): Promise<LaunchedApp> {
  const dir = userData ?? (await mkdtemp(join(tmpdir(), 'sightline-e2e-')));
  const args = [...(process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu'] : []), ...extraArgs, '.'];
  const app = await electron.launch({
    executablePath: electronPath,
    args,
    env: { ...process.env, SIGHTLINE_USER_DATA: dir } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#root > *');
  return {
    app,
    page,
    userData: dir,
    close: async () => {
      await app.close();
      if (!userData) await rm(dir, { recursive: true, force: true });
    },
  };
}

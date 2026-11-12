import { shell } from 'electron';
import type { LinkOpener } from '@core/ports';

/** Opens a link in the default browser. Core has already checked it is one of the configured https links. */
export const externalLinks: LinkOpener = {
  async open(url) {
    if (!/^https:\/\//i.test(url)) throw new Error('Refusing to open a non-https link');
    await shell.openExternal(url);
  },
};

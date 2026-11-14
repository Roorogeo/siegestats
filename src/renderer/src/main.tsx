import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveActiveTheme } from '@shared/theme';
import { App } from './app/App';
import { initBridge } from './bridge';
import './styles/index.css';
import { applyTheme } from './theme/apply';

/** Settings are read before the first render, so the app never shows a frame in the wrong theme. */
async function start(): Promise<void> {
  const bridge = await initBridge();
  const [info, settings] = await Promise.all([bridge.app.getInfo(), bridge.settings.get()]);
  const systemMode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(document.documentElement, resolveActiveTheme(settings.theme, systemMode));

  const root = document.getElementById('root');
  if (!root) throw new Error('#root is missing from index.html');
  createRoot(root).render(
    <StrictMode>
      <App info={info} settings={settings} />
    </StrictMode>,
  );
}

start().catch((error: unknown) => {
  // Nothing else can render without the bridge: say so plainly instead of leaving a blank window.
  const root = document.getElementById('root');
  if (root) {
    root.textContent = `Sightline could not start: ${error instanceof Error ? error.message : String(error)}`;
    root.setAttribute('role', 'alert');
    root.style.padding = '24px';
  }
});

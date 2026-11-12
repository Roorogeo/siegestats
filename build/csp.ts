import type { Plugin } from 'vite';

/**
 * Injects the Content-Security-Policy meta tag.
 * Production: scripts from the app only. Development: Vite's inline React-refresh preamble and
 * its websocket need a looser policy, which never ships.
 */
export function cspPlugin(): Plugin {
  let isBuild = false;
  return {
    name: 'sightline-csp',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml(html) {
      const scriptSrc = isBuild ? "'self'" : "'self' 'unsafe-inline'";
      const connectSrc = isBuild ? "'self'" : "'self' ws: http://localhost:* http://127.0.0.1:*";
      const policy = [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self'",
        `connect-src ${connectSrc}`,
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      return html.replace('<!--csp-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

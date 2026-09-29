import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// Open Graph needs ABSOLUTE urls. Resolved at build time from (first match):
//  VITE_SITE_URL  ->  Vercel production domain  ->  Vercel deployment url  ->  '' (relative, local dev)
const siteUrlPlugin = (env: Record<string, string>): Plugin => ({
  name: 'inject-site-url',
  transformIndexHtml(html) {
    const raw =
      env.VITE_SITE_URL ||
      process.env.VITE_SITE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    const site = raw.replace(/\/+$/, '');
    return html.replace(/__SITE_URL__/g, site);
  },
});

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), tailwindcss(), siteUrlPlugin(env)],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  };
});

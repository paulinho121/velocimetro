import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, PluginOption} from 'vite';

// Browsers only hand out the Geolocation API in a secure context, so testing on
// a real phone over the LAN needs https. Opt in with `npm run dev:https`.
//
// The plugin is loaded lazily on purpose: a production build must not depend on
// a dev-only dependency being installed, or a CI image that skips it fails at
// config-load time before it ever reaches the app.
export default defineConfig(async ({mode}) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];

  if (mode === 'https') {
    const {default: basicSsl} = await import('@vitejs/plugin-basic-ssl');
    plugins.push(basicSsl());
  }

  return {
    plugins,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

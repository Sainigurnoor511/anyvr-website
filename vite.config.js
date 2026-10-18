import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { fishHandler } from './server/fish-tts.js';
import { waitlistHandler } from './server/waitlist.js';
import { FLAGS } from './src/flags.js';

// stamped into the HTML so the page lays out for the right mode before any script runs
function featureFlags() {
  return {
    name: 'feature-flags',
    transformIndexHtml: (html) => html.replace('data-tour3d="off"', `data-tour3d="${FLAGS.tour3d ? 'on' : 'off'}"`),
  };
}

function apiRoutes(env) {
  const routes = { '/api/tts': fishHandler(env), '/api/waitlist': waitlistHandler(env) };
  const mount = (server) => Object.entries(routes).forEach(([path, handler]) => server.middlewares.use(path, handler));
  return { name: 'api-routes', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig(({ mode }) => ({
  plugins: [featureFlags(), apiRoutes(loadEnv(mode, process.cwd(), ['FISH_', 'WAITLIST_']))],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        terms: resolve(import.meta.dirname, 'terms.html'),
      },
    },
  },
}));

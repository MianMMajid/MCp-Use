import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    {
      name: 'suppress-xyflow-warning',
      enforce: 'pre',
      configResolved(config) {
        // Intercept the Rollup onwarn after SvelteKit configures it.
        // Upstream @xyflow/svelte imports handleConnectionChange from
        // @xyflow/system but doesn't use it — non-blocking build noise.
        const originalOnwarn = config.build.rollupOptions?.onwarn;
        config.build.rollupOptions = config.build.rollupOptions ?? {};
        config.build.rollupOptions.onwarn = (warning, defaultHandler) => {
          if (warning.code === 'UNUSED_EXTERNAL_IMPORT' && warning.exporter === '@xyflow/system') return;
          if (originalOnwarn) return originalOnwarn(warning, defaultHandler);
          defaultHandler(warning);
        };
      },
    },
    sveltekit(),
  ],
  server: {
    port: 3000,
    host: true
  },
  preview: {
    allowedHosts: true
  },
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost/',
      },
    },
    setupFiles: ['./vitest.setup.js'],
    include: ['src/**/*.test.{js,ts}'],
  },
});

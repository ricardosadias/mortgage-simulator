import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not the domain root.
  base: '/mortgage-simulator/',
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.mjs',
    // Pinned to the timezone the app's users live in: "local midnight converted to UTC lands
    // on the previous day" bugs are invisible under TZ=UTC.
    env: { TZ: 'Europe/Lisbon' },
  },
});

import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // VITE_BASE lets a deployment under a sub-path (GitHub Pages) prefix asset URLs.
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    // An installable app that works offline: every asset is cached on first
    // visit (the whole site is a few megabytes), and a new build is fetched in
    // the background and offered from the title menu ("Update: restart").
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Ultima III',
        short_name: 'Ultima III',
        description: "LairWare's Macintosh Ultima III, in the browser",
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,gif,jpg,wav,mp3,mov,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173 },
  build: { target: 'es2022' },
  test: {
    // Game logic is tested in Node; the renderer is exercised in the browser.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});

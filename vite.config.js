import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // NOTE: add PNG icons to /public/icons/ (72,96,128,144,152,192,384,512px)
      // and apple-touch-icon.png to /public/ for full native install support
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Calcetto Analytics',
        short_name: 'Calcetto',
        description: 'Gestione partite 5v5, statistiche avanzate e rotazione portieri',
        theme_color: '#1A202C',
        background_color: '#1A202C',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'firestore-cache', expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 } }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: { '@': '/src' }
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          'vendor-utils': ['zustand', 'date-fns', 'react-hot-toast'],
          'vendor-xlsx': ['xlsx'],
        }
      }
    }
  }
});

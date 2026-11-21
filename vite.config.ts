import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import og from './src/site/og.json' with { type: 'json' }

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url))

/**
 * The production address, for canonical URLs and link previews (PLAN 10.6). SITE_URL wins, then
 * Netlify's URL, then Vercel's production domain. A build on a host with none of these fails, so
 * the tags can never point at localhost. Local builds use the preview server's address.
 */
function siteUrl(): string {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ''
  const url = process.env.SITE_URL || process.env.URL || vercel
  if (url) return url.replace(/\/+$/, '')
  if (process.env.NETLIFY || process.env.VERCEL || process.env.CI) {
    throw new Error('Set SITE_URL to the site\'s address (like https://jangal.family) in the host\'s environment settings.')
  }
  return 'http://localhost:5199'
}

// The pages read these as %VITE_SITE_URL% and %VITE_OG_IMAGE% (PLAN 10.3)
process.env.VITE_SITE_URL = siteUrl()
process.env.VITE_OG_IMAGE = og.file

// One multi page build (PLAN 10.1). Each page is its own HTML file, so no host needs rewrite rules:
// "/" is the app (TODO.md F6; there's no landing page any more), "/app/" sends old links there,
// "/privacy/" explains what happens to your data, and "/404.html" is served for anything else.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Repeat visits load from disk and work offline (PLAN A-6, 10.5). The manifest is the static
    // public/site.webmanifest. Heavy, rarely used pieces (the PDF tools, the family page template)
    // are cached the first time they're used instead of on the first visit.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest}'],
        // Fonts for other scripts and the occasional tools load (and are cached) when first needed
        globIgnores: [
          '**/exportPdf-*', '**/html2canvas-*', '**/purify.es-*', '**/index.es-*', '**/PhotoCropper-*',
          '**/*vietnamese*', '**/*latin-ext*', '**/noto-sans-gujarati-*', '**/*.ttf',
          'viewer-template.html', 'og/**', 'app/index.html', 'privacy/**', '404.html',
          // The fill-in page is for relatives, not the app
          'add/**', '**/add-*',
        ],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 1_500_000,
        runtimeCaching: [
          { urlPattern: ({ url }) => url.pathname.includes('/assets/'), handler: 'CacheFirst', options: { cacheName: 'jangal-assets', expiration: { maxEntries: 120 } } },
          { urlPattern: ({ url }) => url.pathname.endsWith('/viewer-template.html'), handler: 'StaleWhileRevalidate', options: { cacheName: 'jangal-viewer' } },
        ],
      },
    }),
  ],
  define: { __VIEWER__: 'false' },
  // Netlify and Vercel serve the site from the domain root. A GitHub Pages project site serves it
  // from "/<repo>/", so its workflow passes the repo name through BASE_PATH.
  base: process.env.BASE_PATH ?? '/',
  // Separate pages, not a single page app: a missing page is a real 404, as it is on the hosts
  appType: 'mpa',
  build: {
    rolldownOptions: {
      input: {
        app: page('./index.html'),
        oldAppAddress: page('./app/index.html'),
        // The fill-in page a relative opens from a link (SHARE.md SH-4)
        add: page('./add/index.html'),
        privacy: page('./privacy/index.html'),
        notFound: page('./404.html'),
      },
      output: {
        // React in its own file, so a deploy that only changes the app leaves it cached
        // (/assets is served as immutable).
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            // The app's stylesheet and fonts, which the fill-in page (SHARE.md) shares
            { name: 'styles', test: /src[\\/]styles[\\/](app|gujarati)\.css|@fontsource-variable[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: { port: 5190 },
  preview: { port: 5199 },
})

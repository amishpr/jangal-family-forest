import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// The read only family page (PLAN 8.10). Built into one HTML file with its JavaScript, CSS and
// fonts inside, so an exported page works offline and makes no network requests at all.
// scripts/finish-viewer.mjs then adds its security policy and writes public/viewer-template.html,
// which the app fills with a tree when someone exports.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile({ removeViteModuleLoader: true })],
  base: './',
  define: {
    __VIEWER__: 'true',
    // The page links to the public site from About, when the build knows where that is
    'import.meta.env.VITE_SITE_URL': JSON.stringify(process.env.SITE_URL ?? process.env.VITE_SITE_URL ?? ''),
  },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    rolldownOptions: { input: fileURLToPath(new URL('./viewer.html', import.meta.url)) },
  },
})

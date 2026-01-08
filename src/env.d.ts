/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** True only in the read only family page build, so editing code is left out of it */
declare const __VIEWER__: boolean

interface ImportMetaEnv {
  readonly VITE_REPO_URL?: string
  readonly VITE_SITE_URL?: string
}

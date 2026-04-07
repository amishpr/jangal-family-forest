// Before `npm run dev`: builds the family page template once if it isn't there yet, so exporting
// a family page works in development too. `npm run build` always rebuilds it.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

if (!existsSync(new URL('../public/viewer-template.html', import.meta.url))) {
  console.log('Building the family page template (npm run build:viewer)')
  execSync('npm run build:viewer', { stdio: 'inherit' })
}

// Links on the public pages start from the site's base path ("/" on Netlify and Vercel,
// "/<repo>/" on GitHub Pages), because the 404 page can be served from any address.

let base = '/'

export const setBase = (b: string) => {
  base = b.endsWith('/') ? b : `${b}/`
}

export const link = (path = '') => `${base}${path}`

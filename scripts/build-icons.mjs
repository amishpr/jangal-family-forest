// The site's icons (PLAN W-4, 10.4), drawn from the leaf: favicon.ico (32 px), apple-touch-icon.png
// (180 px), and 192 and 512 px icons for the web app manifest, one of them maskable (with the leaf
// inside the safe zone, so Android's round or squircle crops never cut it). Run with
// `npm run icons`; the files are committed.

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'

const pub = new URL('../public/', import.meta.url)
const LEAF = (scale) => `<g transform="translate(32 32) scale(${scale}) translate(-32 -32)"><g transform="rotate(38 32 34)"><path d="M32 47V57" stroke="#F4FFF8" stroke-width="3.2" stroke-linecap="round" fill="none"/><path fill="#F4FFF8" d="M32 11C41.8 18.2 45.8 27.6 44.3 36.8C42.9 45 37.6 50 32 50C26.4 50 21.1 45 19.7 36.8C18.2 27.6 22.2 18.2 32 11Z"/><path d="M32 46V19M32 40.5L37.6 35M32 40.5L26.4 35M32 32L36.4 27.6M32 32L27.6 27.6" stroke="#1B9A56" stroke-width="2.2" stroke-linecap="round" fill="none"/></g></g>`
const svg = ({ rounded, scale }) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" ${rounded ? 'rx="16"' : ''} fill="#1B9A56"/>${LEAF(scale)}</svg>`)

const png = (size, opts) => sharp(svg(opts), { density: 72 * (size / 64) * 2 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer()

await mkdir(new URL('icons/', pub), { recursive: true })
// Square corners where the platform rounds the icon itself
await writeFile(new URL('apple-touch-icon.png', pub), await png(180, { rounded: false, scale: 1 }))
await writeFile(new URL('icons/icon-192.png', pub), await png(192, { rounded: true, scale: 1 }))
await writeFile(new URL('icons/icon-512.png', pub), await png(512, { rounded: true, scale: 1 }))
// Maskable: full bleed, leaf within the central 80%
await writeFile(new URL('icons/maskable-512.png', pub), await png(512, { rounded: false, scale: 0.78 }))

// favicon.ico: an ICO file with one 32 px PNG inside
const fav = await png(32, { rounded: true, scale: 1.08 })
const head = Buffer.alloc(6 + 16)
head.writeUInt16LE(0, 0) // reserved
head.writeUInt16LE(1, 2) // icon
head.writeUInt16LE(1, 4) // one image
head.writeUInt8(32, 6) // width
head.writeUInt8(32, 7) // height
head.writeUInt8(0, 8) // no palette
head.writeUInt8(0, 9)
head.writeUInt16LE(1, 10) // planes
head.writeUInt16LE(32, 12) // bits per pixel
head.writeUInt32LE(fav.length, 14)
head.writeUInt32LE(22, 18) // offset
await writeFile(new URL('favicon.ico', pub), Buffer.concat([head, fav]))
console.log('Wrote favicon.ico, apple-touch-icon.png, icons/icon-192.png, icons/icon-512.png, icons/maskable-512.png')

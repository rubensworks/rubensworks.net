#!/usr/bin/env node
// Builds the favicon and app icons from public/img/ruben.jpg.
//
//   node scripts/generate-icons.mjs
//
// The site used to declare one icon: `/img/favicon.jpg`, a 64x64 JPEG, announced as
// `type="image/png"`. That is the only size a browser could ever get, and a phone adding
// the site to its home screen had nothing to use at all.
//
// The source is the portrait rather than favicon.jpg, because favicon.jpg is itself a 64px
// rendering of it — upscaling that to 180px would only blur it.
//
// Run again after replacing the portrait. The output is committed.

import sharp from 'sharp'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = 'public/img/ruben.jpg'
const ICON_DIR = 'public/img/icons'

/** PNG sizes, and where each one is referenced. */
const PNGS = [
  { size: 32, name: 'favicon-32.png' }, // <link rel="icon">, the browser tab
  { size: 180, name: 'apple-touch-icon.png' }, // iOS home screen, fixed size
  { size: 192, name: 'icon-192.png' }, // web manifest
  { size: 512, name: 'icon-512.png' }, // web manifest, splash screens
]

/** The sizes that go inside favicon.ico, for clients that ask for it by that name. */
const ICO_SIZES = [16, 32, 48]

// A palette PNG: a quarter of the bytes of the 24-bit version, and at icon sizes the
// difference is not visible. These are the one set of images optimise-images.mjs leaves
// alone, so the compression has to happen here.
const render = (size) =>
  sharp(SOURCE)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toBuffer()

/**
 * An ICO file holding PNG images: a 6-byte header, one 16-byte directory entry per image,
 * then the PNGs themselves. Every browser in use has read PNG-in-ICO since 2007, and the
 * format is small enough not to be worth a dependency.
 */
function ico(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // 1 = icon
  header.writeUInt16LE(images.length, 4)

  const directory = Buffer.alloc(16 * images.length)
  let offset = header.length + directory.length
  images.forEach(({ size, data }, i) => {
    const e = 16 * i
    directory.writeUInt8(size >= 256 ? 0 : size, e) // 0 means 256
    directory.writeUInt8(size >= 256 ? 0 : size, e + 1)
    directory.writeUInt8(0, e + 2) // colours in palette: 0 for a true-colour image
    directory.writeUInt8(0, e + 3) // reserved
    directory.writeUInt16LE(1, e + 4) // colour planes
    directory.writeUInt16LE(32, e + 6) // bits per pixel
    directory.writeUInt32LE(data.length, e + 8)
    directory.writeUInt32LE(offset, e + 12)
    offset += data.length
  })

  return Buffer.concat([header, directory, ...images.map((i) => i.data)])
}

mkdirSync(ICON_DIR, { recursive: true })

for (const { size, name } of PNGS) {
  const data = await render(size)
  writeFileSync(join(ICON_DIR, name), data)
  console.log(`  img/icons/${name} (${size}x${size}, ${(data.length / 1024).toFixed(1)} KiB)`)
}

const images = await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await render(size) })))
const bytes = ico(images)
writeFileSync('public/favicon.ico', bytes)
console.log(`  favicon.ico (${ICO_SIZES.join(', ')}px, ${(bytes.length / 1024).toFixed(1)} KiB)`)

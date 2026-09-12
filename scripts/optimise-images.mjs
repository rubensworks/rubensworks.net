#!/usr/bin/env node
// Shrinks the images under public/img and writes AVIF and WebP siblings next to them.
//
//   node scripts/optimise-images.mjs [--check]
//
// The site has no build-time image pipeline: posts reference `/img/...` paths directly, and
// those files are copied to the server as they are. So the optimisation happens here, once,
// and the results are committed.
//
// Every image is capped at twice the width it is ever displayed at, which is what a 2x
// screen needs and no more. The AVIF and WebP siblings are what visitors actually download:
// src/lib/images.ts finds them by name and wraps the <img> in a <picture>, leaving the
// original as the fallback.
//
// Re-running is safe. `images.json` records the size and hash of every file this script
// wrote; a file that still matches is left alone, so a second run re-encodes nothing and
// only picks up images that were added or replaced.
//
// `--check` is the CI mode. It asserts the *properties* the optimisation gives an image —
// within its display width, and an AVIF and a WebP beside it — rather than re-encoding and
// comparing bytes, which would fail on any machine whose libvips encodes a shade
// differently. So it catches an image committed straight from a camera or a screenshot
// tool, and it stays fast.

import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, unlinkSync } from 'node:fs'
import { join, relative, sep, extname, basename } from 'node:path'

const ROOT = 'public'
const IMG_DIR = join(ROOT, 'img')
const MANIFEST = 'scripts/images.json'
const check = process.argv.includes('--check')

/**
 * Display widths, from the stylesheet:
 *   - a post's content column is 800px (`$content-width`), so 1600 covers a 2x screen;
 *   - reading-list covers render at 100px (`.book .book-left img`);
 *   - the portrait is the /about/ image at 200px, the nav badge at 30px, and the
 *     og:image — which wants the full square.
 * Anything not listed keeps its dimensions and is only re-encoded.
 */
const MAX_WIDTH = [
  [/^img\/blog\//, 1600],
  [/^img\/reading_list\//, 200],
  [/^img\/ruben\.jpg$/, 512],
]

/**
 * Photographs stored as PNG. PNG is lossless, which is the wrong trade for a photograph:
 * these cost 4.3 MB between them and look identical as JPEG at a fifteenth of that. The
 * pages are rewritten to the `.jpg` — `npm run check:links` fails the build if a reference
 * is missed — and the `.png` stays where it is, under KEPT_AS_PUBLISHED below.
 *
 * Empty because the three conversions it was written for are done. A new photographic PNG
 * belongs here, along with its old name in KEPT_AS_PUBLISHED.
 */
const PNG_TO_JPEG = new Set([])

/**
 * Files this script must not touch, because something outside this repository asks for them
 * by name. Nothing here links to them any more; they exist so that a URL already published
 * keeps resolving.
 *
 * These three are the PNG originals of photographs now served as JPEG. Their `.png` URLs are
 * in the og:image of posts that have been shared, and in any page elsewhere that embedded
 * one, so deleting them would turn someone else's image into a 404 rather than a smaller
 * download. They are never fetched by a visitor to this site.
 *
 * Only removed URLs need an entry. An image re-encoded in place keeps its URL, so a page
 * that hotlinks it simply gets the smaller version.
 */
const KEPT_AS_PUBLISHED = new Set([
  'img/blog/red-car-sunset.png',
  'img/blog/scale-modularity-decentralization-perf.png',
  'img/blog/sparql-federation-stone.png',
])

/** Smaller copies of one source, for the places that display it small. */
const VARIANTS = [
  { from: 'img/ruben.jpg', to: 'img/ruben-400.jpg', width: 400 }, // /about/, shown at 200px
  { from: 'img/ruben.jpg', to: 'img/ruben-64.jpg', width: 64 }, // nav badge, shown at 30px
]

/** Quality settings. Chosen per format, not per image: no image here needs a finer hand. */
const JPEG = { quality: 82, mozjpeg: true }
const PNG = { compressionLevel: 9, palette: true }
const WEBP = { quality: 78 }
const AVIF = { quality: 50 }

const RASTER = /\.(jpe?g|png)$/i

/**
 * The favicon and app icons. They are written by scripts/generate-icons.mjs, already
 * compressed, and referenced by name and type from the <head> and the web manifest — an
 * AVIF beside them would never be loaded, and resizing them is the whole point of them.
 */
const GENERATED = /^img\/icons\//
const sha = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 16)

function listFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) listFiles(p, out)
    else out.push(relative(ROOT, p).split(sep).join('/'))
  }
  return out
}

const maxWidthFor = (rel) => MAX_WIDTH.find(([re]) => re.test(rel))?.[1]

const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {}
const next = {}
const written = []

/** Writes `rel` unless it is already exactly what this script would produce. */
function emit(rel, buf) {
  const path = join(ROOT, rel)
  const digest = sha(buf)
  next[rel] = { bytes: buf.length, sha256: digest }

  const current = existsSync(path) ? readFileSync(path) : null
  if (current && sha(current) === digest) return false
  writeFileSync(path, buf)
  written.push(`${rel} (${(buf.length / 1024).toFixed(0)} KiB)`)
  return true
}

/** True when `rel` is untouched since this script last wrote it. */
const unchanged = (rel) => {
  const known = manifest[rel]
  if (!known || !existsSync(join(ROOT, rel))) return false
  return sha(readFileSync(join(ROOT, rel))) === known.sha256
}

async function optimise(rel, srcBuf, keepOriginal = false) {
  const toJpeg = PNG_TO_JPEG.has(rel)
  const out = toJpeg ? rel.replace(/\.png$/i, '.jpg') : rel
  const width = maxWidthFor(rel)

  const base = () => {
    const s = sharp(srcBuf).rotate() // applies the EXIF orientation, then drops the metadata
    return width ? s.resize({ width, withoutEnlargement: true }) : s
  }

  const isJpeg = extname(out).toLowerCase() !== '.png'
  if (keepOriginal) next[out] = manifest[out]
  else await emit(out, await base()[isJpeg ? 'jpeg' : 'png'](isJpeg ? JPEG : PNG).toBuffer())
  await emit(out.replace(/\.[^.]+$/, '.webp'), await base().webp(WEBP).toBuffer())
  await emit(out.replace(/\.[^.]+$/, '.avif'), await base().avif(AVIF).toBuffer())

  if (toJpeg && existsSync(join(ROOT, rel))) {
    unlinkSync(join(ROOT, rel))
    written.push(`${rel} removed (now ${basename(out)})`)
  }
}

const all = listFiles(IMG_DIR).filter(
  (f) => RASTER.test(f) && !GENERATED.test(f) && !KEPT_AS_PUBLISHED.has(f),
)
const derived = new Set(VARIANTS.map((v) => v.to))

if (check) {
  const problems = []
  for (const rel of all) {
    if (PNG_TO_JPEG.has(rel)) problems.push(`${rel}: a photograph kept as PNG — belongs in the JPEG list`)
    const max = maxWidthFor(rel)
    const { width } = await sharp(join(ROOT, rel)).metadata()
    if (max && width > max) problems.push(`${rel}: ${width}px wide, shown at most ${max / 2}px`)
    for (const ext of ['.webp', '.avif']) {
      const sibling = rel.replace(/\.[^.]+$/, ext)
      if (!existsSync(join(ROOT, sibling))) problems.push(`${rel}: no ${ext} beside it`)
    }
  }
  for (const { to } of VARIANTS) {
    if (!existsSync(join(ROOT, to))) problems.push(`${to}: missing — it is what the small renderings load`)
  }
  for (const rel of KEPT_AS_PUBLISHED) {
    if (!existsSync(join(ROOT, rel))) {
      problems.push(`${rel}: deleted — other sites link to this URL, so it has to keep resolving`)
    }
  }
  if (problems.length) {
    console.error(`FAIL: ${problems.length} image(s) are not optimised:`)
    for (const p of problems) console.error(`  ${p}`)
    console.error('\nRun `npm run images` and commit the result.')
    process.exit(1)
  }
  console.log(`OK: ${all.length} images are within their display width and have AVIF and WebP siblings`)
  process.exit(0)
}


for (const rel of all) {
  if (derived.has(rel)) continue // produced below, from its source
  // A file this script already wrote is its own output, so re-encoding it would be a second
  // lossy pass over the same pixels. Only its siblings, if any are missing, are redone.
  const siblings = [rel.replace(/\.[^.]+$/, '.webp'), rel.replace(/\.[^.]+$/, '.avif')]
  if (unchanged(rel) && siblings.every(unchanged)) {
    for (const f of [rel, ...siblings]) next[f] = manifest[f]
    continue
  }
  await optimise(rel, readFileSync(join(ROOT, rel)), unchanged(rel))
}

for (const { from, to, width } of VARIANTS) {
  const src = existsSync(join(ROOT, from)) ? join(ROOT, from) : null
  if (!src) throw new Error(`${from} does not exist, so ${to} cannot be produced`)
  const buf = readFileSync(src)
  const base = () => sharp(buf).resize({ width, withoutEnlargement: true })
  await emit(to, await base().jpeg(JPEG).toBuffer())
  await emit(to.replace(/\.[^.]+$/, '.webp'), await base().webp(WEBP).toBuffer())
  await emit(to.replace(/\.[^.]+$/, '.avif'), await base().avif(AVIF).toBuffer())
}

writeFileSync(MANIFEST, JSON.stringify(next, null, 2) + '\n')
const total = Object.values(next).reduce((n, v) => n + v.bytes, 0)
console.log(written.length ? written.map((w) => `  ${w}`).join('\n') : '  nothing to do')
console.log(`${Object.keys(next).length} image files, ${(total / 1024 / 1024).toFixed(1)} MiB total`)

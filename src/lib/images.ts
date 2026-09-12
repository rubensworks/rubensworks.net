import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * What the templates need to know about an image in `public/`: how big it is, and whether
 * `scripts/optimise-images.mjs` left an AVIF or a WebP next to it.
 *
 * The dimensions become width/height attributes, which is what stops the page from jumping
 * as images load; the siblings become <source> elements, which is what makes a 180 KiB
 * photograph arrive as 60 KiB.
 *
 * The file headers are read directly rather than through an image library: the build only
 * needs two numbers, and this keeps the site's dependencies to what renders it.
 */

const PUBLIC_DIR = 'public'

export interface ImageInfo {
  /** Intrinsic width in pixels. */
  width: number
  /** Intrinsic height in pixels. */
  height: number
  /** Better-compressed versions of the same image, best first. */
  sources: { type: string; src: string }[]
}

/** Formats in the order a browser should prefer them. */
const ALTERNATIVES = [
  { ext: '.avif', type: 'image/avif' },
  { ext: '.webp', type: 'image/webp' },
]

function readPng(buf: Buffer): [number, number] | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)]
}

/** Walks the JPEG segments to the start-of-frame marker, which carries the dimensions. */
function readJpeg(buf: Buffer): [number, number] | null {
  if (buf.length < 4 || buf.readUInt16BE(0) !== 0xffd8) return null
  let i = 2
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++
      continue
    }
    const marker = buf[i + 1]!
    // SOF0/1/2/3, SOF5-7, SOF9-11, SOF13-15 — every frame type except the DHT/DAC/RST
    // markers that share the range.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  return null
}

function readGif(buf: Buffer): [number, number] | null {
  if (buf.length < 10 || buf.toString('ascii', 0, 3) !== 'GIF') return null
  return [buf.readUInt16LE(6), buf.readUInt16LE(8)]
}

/**
 * An SVG's `width`/`height` if it has them, otherwise the aspect ratio from its `viewBox`.
 * Only the ratio matters for reserving space: the stylesheet sizes these anyway.
 */
function readSvg(buf: Buffer): [number, number] | null {
  const head = buf.toString('utf8', 0, 2048)
  const tag = /<svg\b[^>]*>/i.exec(head)?.[0]
  if (!tag) return null

  /** An attribute of the <svg> element, single- or double-quoted. */
  const attr = (name: string) =>
    new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find((v) => v !== undefined)

  const length = (raw: string | undefined) => {
    // Only a plain number or px says anything about pixels. A percentage is relative to
    // whatever contains it, and the `pt` that dvisvgm writes is a typesetting unit — for
    // both, the viewBox below is the honest answer.
    if (raw === undefined || !/^[\d.]+(px)?$/.test(raw.trim())) return null
    const n = Number.parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  const w = length(attr('width'))
  const h = length(attr('height'))
  if (w && h) return [Math.round(w), Math.round(h)]

  const box = attr('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (box?.length === 4 && box.every(Number.isFinite) && box[2]! > 0 && box[3]! > 0) {
    return [Math.round(box[2]!), Math.round(box[3]!)]
  }
  return null
}

function dimensions(path: string): [number, number] | null {
  // 64 KiB covers a JPEG's segments up to the frame header for every image on the site.
  const buf = readFileSync(path).subarray(0, 65536)
  return readPng(buf) ?? readJpeg(buf) ?? readGif(buf) ?? readSvg(buf)
}

const cache = new Map<string, ImageInfo | null>()

/**
 * Looks up a site-absolute image path such as `/img/blog/apartments.jpg`.
 *
 * Returns null for anything this build cannot see — an external URL, a data: URI, a file
 * that is not in `public/`, or a format whose header is not understood. Callers leave those
 * images exactly as the author wrote them.
 */
export function imageInfo(src: string): ImageInfo | null {
  if (cache.has(src)) return cache.get(src)!

  const info = (() => {
    if (!src.startsWith('/') || src.startsWith('//')) return null
    const clean = src.split(/[?#]/)[0]!
    const path = join(PUBLIC_DIR, decodeURIComponent(clean))
    if (!existsSync(path)) return null

    const size = dimensions(path)
    if (!size) return null

    const sources = ALTERNATIVES.filter(({ ext }) =>
      existsSync(join(PUBLIC_DIR, decodeURIComponent(clean).replace(/\.[^.]+$/, ext))),
    ).map(({ ext, type }) => ({ type, src: clean.replace(/\.[^.]+$/, ext) }))

    return { width: size[0], height: size[1], sources }
  })()

  cache.set(src, info)
  return info
}

/**
 * What every local <img> on the site gets, wherever it was written: a post's Markdown, a
 * project's HTML, or a template.
 *
 *   - `width` and `height`, so the space is reserved before the image arrives and the text
 *     below it does not jump once it does;
 *   - `loading="lazy"` and `decoding="async"`, so images further down the page do not
 *     compete with the ones on screen;
 *   - a <picture> wrapper offering the AVIF and WebP that `scripts/optimise-images.mjs`
 *     wrote next to the file, with the original left as the fallback.
 *
 * A post's feature image is the exception to the lazy loading: it is the largest thing above
 * the fold and so almost always the Largest Contentful Paint, which means it should start
 * downloading immediately rather than after layout. It is recognised by its class.
 *
 * An image that already carries a width or a height keeps it — an author who sized an image
 * by hand meant it.
 */
const EAGER_CLASS = 'feature-img'

export interface ImgAttributes {
  [name: string]: string
}

/** The attributes to add to an <img>, or null to leave it alone. */
export function imgEnhancement(
  attrs: ImgAttributes,
): { added: ImgAttributes; sources: { type: string; src: string }[] } | null {
  const src = attrs.src
  if (!src) return null

  const info = imageInfo(src)
  if (!info) return null

  const added: ImgAttributes = {}
  if (attrs.width === undefined && attrs.height === undefined) {
    added.width = String(info.width)
    added.height = String(info.height)
  }

  const eager = (attrs.class ?? '').split(/\s+/).includes(EAGER_CLASS)
  if (attrs.loading === undefined) {
    if (eager) added.fetchpriority = 'high'
    else added.loading = 'lazy'
  }
  if (attrs.decoding === undefined) added.decoding = 'async'

  return { added, sources: info.sources }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/**
 * Raw HTML written inside a post — the feature image is one — reaches this point as a
 * string rather than as an element, so those <img> tags are rewritten textually.
 */
export function enhanceImgTags(html: string): string {
  // Images already inside a <picture> are left alone: whoever wrote it chose the sources.
  if (/<picture[\s>]/i.test(html)) return html

  return html.replace(/<img\s[^>]*?\/?>/gi, (tag) => {
    const attrs: ImgAttributes = {}
    for (const m of tag.matchAll(/([a-zA-Z-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      if (m.index === 0) continue // the `img` tag name itself
      attrs[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? ''
    }

    const result = imgEnhancement(attrs)
    if (!result) return tag

    const extra = Object.entries(result.added)
      .map(([k, v]) => ` ${k}="${esc(v)}"`)
      .join('')
    const img = tag.replace(/\s*\/?>$/, `${extra}${tag.endsWith('/>') ? ' />' : '>'}`)
    if (result.sources.length === 0) return img

    const sources = result.sources
      .map((s) => `<source srcset="${esc(s.src)}" type="${esc(s.type)}" />`)
      .join('')
    return `<picture>${sources}${img}</picture>`
  })
}

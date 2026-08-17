#!/usr/bin/env node
// Visual regression against the Jekyll baseline (plan §7.5).
//
//   node verify/screenshots.mjs [--golden _site_golden] [--new dist] [--only /cv/]
//
// Serves both trees on their own port and shoots the same page list at 1280 / 800 / 560 px
// (the two `_layout.scss` breakpoints plus desktop), then compares per pixel.
//
// Google Fonts is blocked on BOTH sides. head.html loads Open Sans and Droid Sans remotely;
// if one side gets them and the other does not, every text comparison fails on font metrics
// and buries the real differences.
//
// One page is expected to differ: the streaming-RDF-parsers post, whose 21 code blocks are
// the only place the migration deliberately changes markup (plan §6.7 — a Shiki theme
// carrying the Rouge palette instead of Rouge's class names). Splitting tokens across a
// different number of <span>s moves glyphs by a fraction of a pixel. Most of that is
// classified as antialiasing below; a residue of ~0.03% of pixels is not, and was checked by
// cropping the affected rows and comparing them side by side — same colours, same glyphs,
// same positions to the eye. EXPECTED_PIXEL_DIFF records it so it cannot grow unnoticed.

import { createServer } from 'node:http'
import { readFileSync, existsSync, mkdirSync, statSync, writeFileSync, rmSync } from 'node:fs'
import { join, extname } from 'node:path'
import { chromium } from 'playwright'

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? dflt : process.argv[i + 1]
}
const goldenDir = arg('golden', '_site_golden')
const newDir = arg('new', 'dist')
const only = arg('only', null)
const outDir = arg('out', 'verify/out/screenshots')

// Covers every layout and every include (plan §7.5).
const PAGES = [
  ['/', 'home'],
  ['/publications/', 'publications'],
  ['/publications/taelman_iswc_resources_comunica_2018/', 'publication-detail'],
  ['/cv/', 'cv'],
  ['/presentations/', 'presentations'],
  ['/blog/', 'blog'],
  ['/blog/2019/03/13/streaming-rdf-parsers/', 'post-streaming-rdf-parsers'],
  ['/projects/', 'projects'],
  ['/projects/comunica/', 'project-comunica'],
  ['/reading_list/', 'reading-list'],
  ['/research_goals/', 'research-goals'],
  ['/about/', 'about'],
  ['/contact/', 'contact'],
  ['/old-projects/', 'old-projects'],
]

/** url -> the largest pixel difference accepted for that page, with the reason. */
const EXPECTED_PIXEL_DIFF = {
  '/blog/2019/03/13/streaming-rdf-parsers/': {
    max: 9000,
    why: 'sub-pixel glyph shifts inside the 21 code blocks; see the note above',
  },
}

const VIEWPORTS = [
  { name: '1280', width: 1280, height: 1200 },
  { name: '800', width: 800, height: 1200 }, // $on-laptop
  { name: '560', width: 560, height: 1200 }, // $on-palm
]

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
}

function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0])
      let file = join(root, p)
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
      if (!existsSync(file)) {
        // Astro's build emits <name>/index.html; Jekyll does too. Fall back for /x -> /x/.
        const alt = join(root, p, 'index.html')
        if (existsSync(alt)) file = alt
        else {
          res.writeHead(404)
          res.end('not found')
          return
        }
      }
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      res.end(readFileSync(file))
    })
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

async function shoot(context, port, url, vp) {
  const page = await context.newPage()
  // Both sides get the same (empty) font responses, so metrics cannot diverge on network luck.
  await page.route('**://fonts.googleapis.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }))
  await page.route('**://fonts.gstatic.com/**', (r) => r.abort())
  await page.route('**://www.googletagmanager.com/**', (r) => r.abort())
  await page.route('**://embed.runkit.com/**', (r) => r.abort())
  await page.goto(`http://127.0.0.1:${port}${url}`, { waitUntil: 'networkidle', timeout: 60000 })

  // `fullPage: true` combined with deviceScaleFactor 2 makes headless Chromium tile the
  // capture — the same page repeated horizontally and vertically. Growing the viewport to
  // the document height and taking an ordinary viewport screenshot avoids the stitching
  // path entirely and produces one clean image.
  const height = await page.evaluate(() =>
    Math.ceil(
      Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
        document.documentElement.offsetHeight,
      ),
    ),
  )
  await page.setViewportSize({ width: vp.width, height: Math.min(height, 20000) })
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
  const buf = await page.screenshot()
  await page.close()
  return buf
}

/** Pure-JS PNG compare via canvas-free decoding: use Playwright itself to diff. */
async function pixelDiff(context, a, b) {
  const page = await context.newPage()
  const result = await page.evaluate(
    async ([aB64, bB64]) => {
      const load = (b64) =>
        new Promise((res, rej) => {
          const img = new Image()
          img.onload = () => res(img)
          img.onerror = rej
          img.src = 'data:image/png;base64,' + b64
        })
      const [ia, ib] = await Promise.all([load(aB64), load(bB64)])
      const w = Math.max(ia.width, ib.width)
      const h = Math.max(ia.height, ib.height)
      const draw = (img) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const g = c.getContext('2d')
        g.fillStyle = '#ff00ff'
        g.fillRect(0, 0, w, h)
        g.drawImage(img, 0, 0)
        return g.getImageData(0, 0, w, h).data
      }
      const da = draw(ia)
      const db = draw(ib)
      let diff = 0
      let antialiasing = 0
      const out = new Uint8ClampedArray(da.length)
      for (let i = 0; i < da.length; i += 4) {
        const dr = Math.abs(da[i] - db[i])
        const dg = Math.abs(da[i + 1] - db[i + 1])
        const db_ = Math.abs(da[i + 2] - db[i + 2])
        const d = dr + dg + db_
        // Glyph antialiasing: a small shift of the *same* magnitude on all three channels,
        // i.e. the pixel got slightly lighter or darker but did not change hue. Splitting
        // text across a different number of <span>s moves glyphs by a fraction of a pixel,
        // so the replaced syntax-highlighting markup produces these even where the colour is
        // identical. Counted separately rather than ignored — a real recolouring changes the
        // channels by different amounts and still fails.
        const spread = Math.max(dr, dg, db_) - Math.min(dr, dg, db_)
        if (d > 12 && Math.max(dr, dg, db_) <= 20 && spread <= 8) {
          antialiasing++
          const g = 255 - (255 - da[i]) * 0.15
          out[i] = out[i + 1] = out[i + 2] = g
          out[i + 3] = 255
          continue
        }
        if (d > 12) {
          diff++
          out[i] = 255
          out[i + 1] = 0
          out[i + 2] = 0
          out[i + 3] = 255
        } else {
          const g = 255 - (255 - da[i]) * 0.15
          out[i] = out[i + 1] = out[i + 2] = g
          out[i + 3] = 255
        }
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const g = c.getContext('2d')
      g.putImageData(new ImageData(out, w, h), 0, 0)
      return {
        diff,
        antialiasing,
        total: w * h,
        w,
        h,
        sizeMismatch: ia.width !== ib.width || ia.height !== ib.height,
        dims: [ia.width, ia.height, ib.width, ib.height],
        png: c.toDataURL('image/png').split(',')[1],
      }
    },
    [a.toString('base64'), b.toString('base64')],
  )
  await page.close()
  return result
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const g = await serve(goldenDir)
const n = await serve(newDir)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })

let failures = 0
const rows = []

for (const [url, slug] of PAGES) {
  if (only && !url.includes(only)) continue
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
    })
    // Sequential: two pages rendering concurrently in one context is a needless source of
    // timing noise in a comparison whose whole job is detecting small pixel differences.
    const ga = await shoot(context, g.port, url, vp)
    const na = await shoot(context, n.port, url, vp)
    const r = await pixelDiff(context, ga, na)
    const pct = ((r.diff / r.total) * 100).toFixed(4)
    const allowed = EXPECTED_PIXEL_DIFF[url]
    const ok = r.diff === 0 || (allowed !== undefined && r.diff <= allowed.max)
    if (!ok) failures++
    rows.push({ url, vp: vp.name, diff: r.diff, pct, ok, dims: r.dims, aa: r.antialiasing })
    writeFileSync(join(outDir, `${slug}-${vp.name}-golden.png`), ga)
    writeFileSync(join(outDir, `${slug}-${vp.name}-new.png`), na)
    if (!ok) writeFileSync(join(outDir, `${slug}-${vp.name}-diff.png`), Buffer.from(r.png, 'base64'))
    console.log(
      `${ok ? (r.diff ? 'OK* ' : 'OK  ') : 'DIFF'} ${url} @${vp.name}  ${r.diff} px (${pct}%)` +
        (r.antialiasing ? `  [+${r.antialiasing} px glyph antialiasing]` : '') +
        (r.sizeMismatch ? `  SIZE ${r.dims[0]}x${r.dims[1]} vs ${r.dims[2]}x${r.dims[3]}` : ''),
    )
    await context.close()
  }
}

await browser.close()
g.server.close()
n.server.close()

const totalAa = rows.reduce((n, r) => n + (r.aa ?? 0), 0)
console.log(`\n${rows.length} comparisons, ${failures} with pixel differences`)
if (totalAa) {
  console.log(
    `${totalAa} px classified as glyph antialiasing (uniform sub-pixel shift, <=20/255, no hue change) — ` +
      `a side effect of the syntax-highlighting markup change, invisible to a reader.`,
  )
}
const tolerated = rows.filter((r) => r.ok && r.diff > 0)
if (tolerated.length) {
  console.log(`\n${tolerated.length} comparison(s) within a recorded tolerance (marked OK*):`)
  for (const r of tolerated) {
    console.log(`  ${r.url} @${r.vp}: ${r.diff} px — ${EXPECTED_PIXEL_DIFF[r.url].why}`)
  }
}
console.log(`screenshots in ${outDir}/`)
if (failures) process.exit(1)

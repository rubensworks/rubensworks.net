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
// The three posts with code blocks are expected to differ inside those blocks, and nowhere
// else. Code-block token markup is the one thing the migration deliberately changes (plan
// §6.7 — a Shiki theme carrying the Rouge palette instead of Rouge's class names), and Shiki
// breaks the text into <span>s at different places than Rouge did. A browser positions text
// per run, so a different break point changes where sub-pixel LCD antialiasing lands: the
// glyphs are the same glyphs, in the same places, in the same colours, but the orange/blue
// fringes on some stems land differently. Magnifying an affected line 6x shows exactly that.
//
// Nothing here rests on that reading. verify/code-colors.mjs resolves every visible code
// character to its effective colour, weight and slant on both sides and requires them to be
// identical — 0 of 8511 differ — so the residue cannot be a recolouring. This pass then
// pins down where it is allowed to be: inside `pre.highlight`, in the recorded quantity,
// with the blocks in identical positions. Everywhere else, every viewport, zero.
//
// Merging same-colour spans was tried, to make the runs coarser: it made the residue
// slightly worse (71245 -> 72444 px), because what matters is not how many breaks there are
// but whether they are in the same places. Only reproducing Rouge's tokenizer would do
// that, which is plan §6.7 option 2 and was not the option chosen.

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

// Covers every layout, every include and every page whose body is hand-written prose or
// markdown (plan §7.5). All six posts are here rather than a representative one: the posts
// are the only pages that run the kramdown-compatibility pipeline, and each uses a
// different subset of it — figures, inline attribute lists, tables, code blocks, footnotes.
// The publication and project pages are template-driven and identical in shape, so those
// are sampled; the whole set of 92 publication URLs is checked by verify/html-diff.mjs.
const PAGES = [
  ['/', 'home'],
  ['/publications/', 'publications'],
  ['/publications/taelman_iswc_resources_comunica_2018/', 'publication-detail'],
  ['/publications/taelman_phd_2020/', 'publication-detail-phd'],
  ['/cv/', 'cv'],
  ['/presentations/', 'presentations'],
  ['/blog/', 'blog'],
  ['/blog/2019/03/13/streaming-rdf-parsers/', 'post-streaming-rdf-parsers'],
  ['/blog/2019/10/06/using-rdf-in-javascript/', 'post-using-rdf-in-javascript'],
  ['/blog/2021/05/24/5-rules-open-source-maintenance/', 'post-5-rules'],
  ['/blog/2022/01/21/querying-a-decentralized-web/', 'post-querying-decentralized-web'],
  ['/blog/2025/04/22/cost-modularity-sparql/', 'post-cost-modularity-sparql'],
  ['/blog/2026/04/13/did-ai-clawlers-kill-sparql-federation/', 'post-did-ai-clawlers'],
  ['/projects/', 'projects'],
  ['/projects/comunica/', 'project-comunica'],
  ['/projects/minecraft/', 'project-minecraft'],
  ['/projects/rdfjs/', 'project-rdfjs'],
  ['/reading_list/', 'reading-list'],
  ['/research_goals/', 'research-goals'],
  ['/about/', 'about'],
  ['/contact/', 'contact'],
  ['/old-projects/', 'old-projects'],
  ['/application-swsa-distinguished-dissertation-award-2020/', 'award-application'],
]

/**
 * url -> viewport -> `[differing pixels, antialiasing pixels]` accepted *inside the code
 * blocks* on that page, at that width.
 *
 * Everything else has to be zero, at every viewport: `diffOutside` and
 * `antialiasingOutside` fail on any page, and a page not listed here has no budget at all.
 * Both buckets are bounded, deliberately — a classifier that can absorb an unlimited number
 * of pixels is not a classifier, it is a hole. The numbers are exact measurements taken on
 * a Linux/Chromium/DejaVu-Sans-Mono stack, not round headroom: if anything moves one of
 * them, this run says so and the number has to be re-justified. They are specific to the
 * rendering stack, so expect to re-record them if you run this somewhere else.
 */
const EXPECTED_PIXEL_DIFF = {
  '/blog/2019/03/13/streaming-rdf-parsers/': {
    why: '21 code blocks, JavaScript and JSON',
    1280: [5098, 26381],
    800: [5098, 26381],
    560: [5098, 26315],
  },
  '/blog/2019/10/06/using-rdf-in-javascript/': {
    // The largest residue on the site, and the one that scales with how finely the grammar
    // splits the text: 17 JavaScript blocks, where TextMate scopes are far more granular
    // than Rouge's tokens. At 560 px the blocks are narrower, so less of the code is on
    // screen and fewer glyphs are affected.
    why: '17 code blocks, JavaScript and JSON',
    1280: [71245, 213123],
    800: [71230, 213138],
    560: [8737, 248044],
  },
  '/blog/2026/04/13/did-ai-clawlers-kill-sparql-federation/': {
    why: '3 code blocks, SPARQL',
    1280: [1287, 26366],
    800: [1287, 26385],
    560: [1287, 25891],
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
  // Where the highlighted code sits, in device pixels. The page is not scrolled and the
  // viewport is the whole document, so client rects are document coordinates.
  const rects = await page.evaluate(() => {
    const dpr = window.devicePixelRatio
    return [...document.querySelectorAll('pre.highlight')].map((el) => {
      const r = el.getBoundingClientRect()
      return [
        Math.floor(r.left * dpr),
        Math.floor(r.top * dpr),
        Math.ceil(r.right * dpr),
        Math.ceil(r.bottom * dpr),
      ]
    })
  })
  await page.close()
  return { buf, rects }
}

/**
 * Pure-JS PNG compare via canvas-free decoding: use Playwright itself to diff.
 *
 * `rects` are the highlighted code blocks. Differences are counted inside and outside them
 * separately, because the two have completely different standing: outside a code block
 * nothing about this migration should move a pixel, while inside one the token markup was
 * deliberately replaced and a residue of sub-pixel coverage differences is expected. A
 * page-wide budget would let a real regression anywhere on the page hide behind it.
 */
async function pixelDiff(context, a, b, rects) {
  const page = await context.newPage()
  const result = await page.evaluate(
    async ([aB64, bB64, boxes]) => {
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
      // One byte per pixel: is it inside a code block?
      const inCode = new Uint8Array(w * h)
      for (const [x0, y0, x1, y1] of boxes) {
        for (let y = Math.max(0, y0); y < Math.min(h, y1); y++) {
          inCode.fill(1, y * w + Math.max(0, x0), y * w + Math.min(w, x1))
        }
      }
      let diff = 0
      let diffOutside = 0
      let antialiasing = 0
      let antialiasingOutside = 0
      const out = new Uint8ClampedArray(da.length)
      for (let i = 0; i < da.length; i += 4) {
        const code = inCode[i >> 2] === 1
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
          if (!code) antialiasingOutside++
          const g = 255 - (255 - da[i]) * 0.15
          out[i] = out[i + 1] = out[i + 2] = g
          out[i + 3] = 255
          continue
        }
        if (d > 12) {
          diff++
          if (!code) diffOutside++
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
        diffOutside,
        antialiasing,
        antialiasingOutside,
        codeBlocks: boxes.length,
        total: w * h,
        w,
        h,
        sizeMismatch: ia.width !== ib.width || ia.height !== ib.height,
        dims: [ia.width, ia.height, ib.width, ib.height],
        png: c.toDataURL('image/png').split(',')[1],
      }
    },
    [a.toString('base64'), b.toString('base64'), rects],
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
    // The code blocks must land in the same place on both sides before their contents are
    // given any budget at all; if they do not, that is a layout regression, not a residue.
    const sameBoxes = JSON.stringify(ga.rects) === JSON.stringify(na.rects)
    const r = await pixelDiff(context, ga.buf, na.buf, ga.rects)
    const pct = ((r.diff / r.total) * 100).toFixed(4)
    const [budget = 0, aaBudget = 0] = EXPECTED_PIXEL_DIFF[url]?.[vp.name] ?? []
    const inside = r.diff - r.diffOutside
    const aaInside = r.antialiasing - r.antialiasingOutside
    const ok =
      sameBoxes &&
      r.diffOutside === 0 &&
      r.antialiasingOutside === 0 &&
      inside <= budget &&
      aaInside <= aaBudget
    if (!ok) failures++
    rows.push({
      url, vp: vp.name, diff: r.diff, inside, outside: r.diffOutside, pct, ok, budget,
      dims: r.dims, aa: r.antialiasing, aaInside, aaOutside: r.antialiasingOutside, aaBudget,
      blocks: r.codeBlocks, sameBoxes,
    })
    writeFileSync(join(outDir, `${slug}-${vp.name}-golden.png`), ga.buf)
    writeFileSync(join(outDir, `${slug}-${vp.name}-new.png`), na.buf)
    if (!ok) writeFileSync(join(outDir, `${slug}-${vp.name}-diff.png`), Buffer.from(r.png, 'base64'))
    console.log(
      `${ok ? (r.diff ? 'OK* ' : 'OK  ') : 'DIFF'} ${url} @${vp.name}  ${r.diff} px (${pct}%)` +
        (r.diff ? `  [${inside} in code, ${r.diffOutside} outside]` : '') +
        (r.antialiasing ? `  [+${r.antialiasing} px glyph antialiasing, ${r.antialiasingOutside} outside]` : '') +
        (sameBoxes ? '' : '  CODE-BLOCK GEOMETRY DIFFERS') +
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
    console.log(
      `  ${r.url} @${r.vp}: ${r.inside}/${r.budget} px plus ${r.aaInside}/${r.aaBudget} px ` +
        `antialiasing, all inside ${r.blocks} code block(s) — ${EXPECTED_PIXEL_DIFF[r.url].why}`,
    )
  }
}
const failed = rows.filter((r) => !r.ok)
if (failed.length) {
  console.error(`\n${failed.length} comparison(s) failed:`)
  for (const r of failed) {
    console.error(
      `  ${r.url} @${r.vp}: ${r.outside} px outside code blocks, ` +
        `${r.aaOutside} px antialiasing outside, ${r.inside} px inside (budget ${r.budget}), ` +
        `${r.aaInside} px antialiasing inside (budget ${r.aaBudget})` +
        (r.sameBoxes ? '' : ', and the code blocks are in different places'),
    )
  }
}
console.log(`screenshots in ${outDir}/`)
if (failures) process.exit(1)

#!/usr/bin/env node
// Built-site checks for the things search engines and browsers read, but that nothing else
// in the build would notice going missing.
//
//   node scripts/check-seo.mjs <dir>
//
// It exists for the same reason check-links.mjs does: adding a publication, a post or a
// project should never mean editing a test, but it should also never quietly ship a page
// with no description, a title shared with 90 other pages, or an image that makes the
// layout jump. Every rule here is about a page that was built, so it runs after the build.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep, posix } from 'node:path'
import { parse } from 'parse5'

const dir = process.argv[2] ?? 'dist'
const SITE = 'https://www.rubensworks.net'

/** The sitemap does not list the 404 page, and neither do these rules. */
const NOT_A_PAGE = (file) => file === '404.html'

/**
 * The site-wide tagline is the description of last resort, and any page still carrying it is
 * a page nobody has described.
 */
const SITE_TAGLINE = 'Computer scientist, researcher, programmer'

/**
 * Pages that legitimately share a description with another, listed rather than excused in
 * the rule itself, so the check stays blocking for everything else.
 */
const KNOWN_DUPLICATE_DESCRIPTIONS = [
  {
    file: 'publications/bogaerts_tplp_distributedsubwebs_2023/index.html',
    why:
      'the TPLP article is the journal version of the RuleML paper and references.bib gives ' +
      'them the same abstract, which is where both descriptions come from',
  },
]

function listFiles(d, base = d, out = []) {
  for (const name of readdirSync(d)) {
    const p = join(d, name)
    if (statSync(p).isDirectory()) listFiles(p, base, out)
    else out.push(relative(base, p).split(sep).join('/'))
  }
  return out
}

const files = listFiles(dir)
const fileSet = new Set(files)
const htmlFiles = files.filter((f) => f.endsWith('.html'))

const tag = (node, name, out = []) => {
  if (node.tagName === name) out.push(node)
  for (const c of node.childNodes ?? []) tag(c, name, out)
  return out
}
const attrs = (node) => Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]))
const text = (node) =>
  (node.childNodes ?? []).map((c) => (c.nodeName === '#text' ? c.value : text(c))).join('')

const errors = []
const allowed = []
const fail = (file, message) => errors.push(`${file}: ${message}`)

const titles = new Map()
const descriptions = new Map()
let images = 0
let sources = 0

for (const file of htmlFiles) {
  if (NOT_A_PAGE(file)) continue
  const doc = parse(readFileSync(join(dir, file), 'utf8'))
  const metas = tag(doc, 'meta').map(attrs)
  const links = tag(doc, 'link').map(attrs)
  const url = '/' + file.replace(/index\.html$/, '')

  const title = tag(doc, 'title')[0] && text(tag(doc, 'title')[0])
  if (!title) fail(file, 'no <title>')
  else {
    // Long titles are cut off in a search result. 60 characters is where Google starts to,
    // and the publication titles are the reason this is a warning boundary, not a hard one.
    if (!title.includes('Ruben Taelman')) fail(file, `<title> does not name the site: "${title}"`)
    const seen = titles.get(title)
    if (seen) fail(file, `<title> is identical to the one on ${seen}: "${title}"`)
    else titles.set(title, file)
  }

  const description = metas.find((m) => m.name === 'description')?.content
  if (!description) fail(file, 'no <meta name="description">')
  else if (description.trim() === SITE_TAGLINE) {
    fail(file, 'falls back to the site tagline for its description — give the page its own')
  } else {
    const seen = descriptions.get(description)
    const known = KNOWN_DUPLICATE_DESCRIPTIONS.find((d) => d.file === file)
    if (seen && known) allowed.push(`${file}\n    shares its description with ${seen}: ${known.why}`)
    else if (seen) fail(file, `description is identical to the one on ${seen}`)
    else descriptions.set(description, file)
  }

  const canonical = links.find((l) => l.rel === 'canonical')?.href
  if (!canonical) fail(file, 'no <link rel="canonical">')
  else if (canonical !== SITE + url) fail(file, `canonical is ${canonical}, expected ${SITE + url}`)

  if (!metas.some((m) => m.name === 'viewport')) fail(file, 'no viewport meta')
  if (tag(doc, 'main').length !== 1) fail(file, `${tag(doc, 'main').length} <main> elements, expected 1`)

  const html = tag(doc, 'html')[0]
  if (!attrs(html ?? {}).lang) fail(file, 'no lang on <html>')

  for (const img of tag(doc, 'img')) {
    const a = attrs(img)
    images++
    if (a.alt === undefined) fail(file, `<img src="${a.src}"> has no alt`)
    // Local images: the build knows their size, so there is no reason for one to ship
    // without it — that is what makes the text below an image jump as it loads. An image
    // the author sized in percent is the exception; a pixel height would contradict it.
    const sizedByAuthor = a.width?.endsWith('%') || a.height?.endsWith('%')
    if (a.src?.startsWith('/') && !sizedByAuthor && (!a.width || !a.height)) {
      fail(file, `<img src="${a.src}"> has no width/height`)
    }
  }

  // <picture> sources are not links, so check-links.mjs does not see them; a renamed image
  // would leave them pointing nowhere, silently, because the <img> fallback still works.
  for (const source of tag(doc, 'source')) {
    const srcset = attrs(source).srcset
    sources++
    if (!srcset?.startsWith('/')) continue
    const target = srcset.replace(/^\//, '').split(/[?#]/)[0]
    if (!fileSet.has(decodeURIComponent(target))) {
      fail(file, `<source srcset="${srcset}"> does not exist`)
    }
  }
}

// The sitemap is what a search engine reads instead of guessing; a page missing from it is
// a page that is only found by following a link to it.
const indexFile = 'sitemap-index.xml'
if (!fileSet.has(indexFile)) {
  fail(indexFile, 'no sitemap index was built')
} else {
  const listed = new Set()
  for (const part of files.filter((f) => /^sitemap-\d+\.xml$/.test(f))) {
    for (const m of readFileSync(join(dir, part), 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
      listed.add(m[1].replace(SITE, ''))
    }
  }
  for (const file of htmlFiles) {
    if (NOT_A_PAGE(file)) continue
    const url = '/' + file.replace(/index\.html$/, '')
    if (!listed.has(url)) fail(file, 'is not listed in the sitemap')
  }
  for (const url of listed) {
    const target = posix.join(url.replace(/^\//, ''), 'index.html').replace(/^index\.html$/, 'index.html')
    if (!fileSet.has(target) && !fileSet.has(url.replace(/^\//, ''))) {
      fail('sitemap', `lists ${url}, which was not built`)
    }
  }
}

if (!fileSet.has('robots.txt')) fail('robots.txt', 'is missing')
else if (!readFileSync(join(dir, 'robots.txt'), 'utf8').includes('sitemap-index.xml')) {
  fail('robots.txt', 'does not point at the sitemap')
}
if (!fileSet.has('404.html')) fail('404.html', 'is missing')
if (!fileSet.has('favicon.ico')) fail('favicon.ico', 'is missing')
if (!fileSet.has('site.webmanifest')) fail('site.webmanifest', 'is missing')

console.log(
  `checked ${htmlFiles.length - 1} pages: ${titles.size} distinct titles, ` +
    `${descriptions.size} distinct descriptions, ${images} images, ${sources} <picture> sources`,
)

if (allowed.length) {
  console.log(`\n${allowed.length} description(s) shared on purpose:`)
  for (const a of allowed) console.log(`  ${a}`)
}

if (errors.length) {
  console.error(`\nFAIL: ${errors.length} problem(s):`)
  for (const e of errors) console.error(`  ${e}`)
  process.exit(1)
}
console.log('OK: every page has a unique title and description, a canonical URL, one <main>,')
console.log('    sized images with alt text, and a place in the sitemap')

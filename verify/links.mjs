#!/usr/bin/env node
// Internal link and in-page anchor integrity (plan §7.4).
//
//   node verify/links.mjs <dir>
//
// Replaces `script/cibuild`'s `htmlproofer ... || true`. This one exits non-zero, which is
// the point: the kramdown-vs-github-slugger heading-slug risk (§6.4.3) is only guarded if a
// broken #anchor actually fails the build.
//
// External URLs are not fetched — that makes CI depend on 200-odd third-party hosts.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep, posix } from 'node:path'
import { parse } from 'parse5'

const dir = process.argv[2] ?? 'dist'
const SITE_HOSTS = new Set(['www.rubensworks.net', 'rubensworks.net'])

// Same-host paths that this repository does not build. `/raw/**` holds the PDFs and slide
// decks, uploaded to the server out-of-band; they were never in _site either. Treated as
// external so the checker verifies what the build controls.
const NOT_BUILT_HERE = [/^\/raw\//]

// Pre-existing breakage carried over from the Jekyll site verbatim. Listed rather than
// fixed, because fixing it would change the rendered output and the migration's contract is
// byte-for-byte fidelity. Reported at the end of every run so it cannot be forgotten.
const KNOWN_BROKEN = [
  {
    file: 'projects/minecraft/index.html',
    href: '#commision',
    why:
      '_projects/minecraft.html links to #commision but no element carries that id — a ' +
      'typo that predates this migration. Fixing it means editing an input file and ' +
      'changing the output, so it is deliberately preserved.',
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

/** Collects every element id and <a name> on a page. */
function collect(node, ids, links) {
  if (node.tagName) {
    const attrs = Object.fromEntries((node.attrs ?? []).map((a) => [a.name, a.value]))
    if (attrs.id) ids.add(attrs.id)
    if (node.tagName === 'a' && attrs.name) ids.add(attrs.name)
    if (node.tagName === 'a' && attrs.href !== undefined) links.push({ href: attrs.href, tag: 'a' })
    if (node.tagName === 'link' && attrs.href !== undefined) links.push({ href: attrs.href, tag: 'link' })
    if (node.tagName === 'img' && attrs.src !== undefined) links.push({ href: attrs.src, tag: 'img' })
    if (node.tagName === 'script' && attrs.src !== undefined) links.push({ href: attrs.src, tag: 'script' })
  }
  for (const c of node.childNodes ?? []) collect(c, ids, links)
}

const pages = new Map()
for (const f of htmlFiles) {
  const ids = new Set()
  const links = []
  collect(parse(readFileSync(join(dir, f), 'utf8')), ids, links)
  pages.set(f, { ids, links })
}

/** Maps a site-absolute path to the file that serves it. */
function resolveTarget(pathname) {
  let p = pathname.replace(/^\//, '')
  if (p === '') p = 'index.html'
  if (fileSet.has(p)) return p
  if (fileSet.has(posix.join(p, 'index.html'))) return posix.join(p, 'index.html')
  if (p.endsWith('/') && fileSet.has(p + 'index.html')) return p + 'index.html'
  // Jekyll's `permalink: pretty` URLs are usually written without the trailing slash.
  if (fileSet.has(p.replace(/\/$/, '') + '/index.html')) return p.replace(/\/$/, '') + '/index.html'
  return null
}

const errors = []
let internal = 0
let anchors = 0

for (const [file, { links }] of pages) {
  const selfDir = posix.dirname('/' + file)
  for (const { href, tag } of links) {
    if (!href || href.startsWith('data:') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue

    let pathname
    let hash

    if (/^https?:\/\//i.test(href)) {
      const u = new URL(href)
      if (!SITE_HOSTS.has(u.hostname)) continue // external: not fetched, by design
      if (NOT_BUILT_HERE.some((re) => re.test(u.pathname))) continue
      pathname = u.pathname
      hash = decodeURIComponent(u.hash.replace(/^#/, ''))
    } else if (href.startsWith('#')) {
      pathname = '/' + file
      hash = decodeURIComponent(href.slice(1))
    } else if (href.startsWith('//')) {
      continue // protocol-relative external
    } else {
      const [pRaw, hRaw = ''] = href.split('#')
      hash = decodeURIComponent(hRaw)
      pathname = pRaw.startsWith('/') ? pRaw : posix.normalize(posix.join(selfDir, pRaw))
      if (pRaw === '') pathname = '/' + file
      if (NOT_BUILT_HERE.some((re) => re.test(pathname))) continue
    }

    const target = resolveTarget(decodeURIComponent(pathname))
    internal++
    if (!target) {
      errors.push({ file, tag, href, reason: `no such page (${pathname})` })
      continue
    }
    if (!hash) continue
    anchors++
    const targetIds = pages.get(target)?.ids
    if (!targetIds) continue // target is not HTML (e.g. an image)
    if (!targetIds.has(hash)) {
      errors.push({ file, tag, href, reason: `#${hash} does not exist in ${target}` })
    }
  }
}

const known = []
const real = []
for (const e of errors) {
  const k = KNOWN_BROKEN.find((x) => e.file === x.file && e.href === x.href)
  if (k) known.push({ ...e, why: k.why })
  else real.push(e)
}

console.log(`checked ${pages.size} pages: ${internal} internal links, ${anchors} in-page anchors`)
console.log(`  (${NOT_BUILT_HERE.length} same-host path prefix(es) treated as external: /raw/**)`)

if (known.length) {
  console.log(`\n${known.length} known pre-existing breakage(s), carried over deliberately:`)
  for (const e of known) console.log(`  ${e.file}: ${e.href}\n    ${e.why}`)
}
if (real.length) {
  console.error(`\nFAIL: ${real.length} broken link(s)/anchor(s):`)
  for (const e of real) console.error(`  ${e.file}: <${e.tag} href="${e.href}"> -> ${e.reason}`)
  process.exit(1)
}
console.log('\nOK: every internal link and #anchor resolves')

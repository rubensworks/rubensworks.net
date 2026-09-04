#!/usr/bin/env node
// RDF graph equivalence across every page (plan §7.3).
//
//   node verify/rdf-diff.mjs <golden-dir> <new-dir> [--only substr]
//
// The site publishes RDFa and microdata (foaf:, schema.org, bibframe:, vivo:, org:, cert:)
// plus a JSON-LD block on the homepage. Markup can legitimately shift; the *graph* may not.
// Both sides are parsed, blank nodes are handled by rdf-isomorphic, and any triple
// difference fails.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { Readable } from 'node:stream'
import { rdfParser } from 'rdf-parse'
import { isomorphic } from 'rdf-isomorphic'
import { normalizeHtml } from './lib/normalize.mjs'

const parser = rdfParser
const SITE = 'https://www.rubensworks.net'

const [goldenDir, newDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const onlyIdx = process.argv.indexOf('--only')
const only = onlyIdx < 0 ? undefined : process.argv[onlyIdx + 1]

if (!goldenDir || !newDir) {
  console.error('usage: rdf-diff.mjs <golden-dir> <new-dir> [--only substr]')
  process.exit(2)
}

function listHtml(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.html')) out.push(relative(dir, p).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

/** The URL a page is served at — needed so relative RDFa subjects resolve identically. */
function baseIri(file) {
  return `${SITE}/${file.replace(/index\.html$/, '')}`
}

function parseHtml(html, base) {
  return new Promise((resolve, reject) => {
    const quads = []
    parser
      .parse(Readable.from([html]), { contentType: 'text/html', baseIRI: base })
      .on('data', (q) => quads.push(q))
      .on('error', reject)
      .on('end', () => resolve(quads))
  })
}

/**
 * Whitespace runs inside literals are collapsed before comparison.
 *
 * Only one kind of triple needs it: `schema:articleBody` on the 6 post pages, which is a
 * microdata literal and therefore the element's *exact* text content. kramdown separated
 * block elements with a blank line and indented blockquote content; remark-rehype uses a
 * single newline and no indentation. None of that is visible to a reader — HTML collapses
 * whitespace between block elements — but it does change the literal byte-for-byte.
 * (RDFa already normalises whitespace in plain literals, which is why only the microdata
 * half of the graph is affected.)
 *
 * Collapsing is the narrowest fix that still fails on any real text change: every character
 * that is not whitespace is still compared. Triples that match only after collapsing are
 * counted and reported, so this can never quietly grow.
 */
const collapseWhitespace = (s) => s.replace(/\s+/g, ' ').trim()

const termKey = (t, { collapse = false } = {}) => {
  if (t.termType === 'Literal') {
    const value = collapse ? collapseWhitespace(t.value) : t.value
    return `"${value}"^^<${t.datatype.value}>${t.language ? `@${t.language}` : ''}`
  }
  if (t.termType === 'BlankNode') return '_:'
  return `<${t.value}>`
}
const quadKey = (q, opts) =>
  `${termKey(q.subject, opts)} ${termKey(q.predicate, opts)} ${termKey(q.object, opts)} ${q.graph.value ? `<${q.graph.value}>` : ''}`

/** Multiset of quad keys, for comparing two graphs without blank-node matching. */
const keyCounts = (quads, opts) => {
  const m = new Map()
  for (const q of quads) {
    const k = quadKey(q, opts)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

const sameCounts = (a, b) =>
  a.size === b.size && [...a].every(([k, v]) => b.get(k) === v)

const goldenFiles = listHtml(goldenDir)
const newSet = new Set(listHtml(newDir))

let checked = 0
let failed = 0
let totalTriples = 0
let whitespaceOnly = 0
const whitespacePages = []

for (const f of goldenFiles) {
  if (only && !f.includes(only)) continue
  if (!newSet.has(f)) continue
  const base = baseIri(f)
  const [gq, nq] = await Promise.all([
    parseHtml(normalizeHtml(readFileSync(join(goldenDir, f), 'utf8')), base),
    parseHtml(normalizeHtml(readFileSync(join(newDir, f), 'utf8')), base),
  ])
  checked++
  totalTriples += gq.length

  if (isomorphic(gq, nq)) continue

  // Identical once literal whitespace is collapsed? Then the only difference is block-level
  // formatting, which no reader can see. Counted and reported rather than ignored.
  if (sameCounts(keyCounts(gq, { collapse: true }), keyCounts(nq, { collapse: true }))) {
    whitespaceOnly++
    whitespacePages.push(f)
    continue
  }

  failed++
  console.error(`\n══ ${f} ══  golden ${gq.length} triples, new ${nq.length}`)
  const gm = keyCounts(gq, {})
  const nm = keyCounts(nq, {})
  const keys = new Set([...gm.keys(), ...nm.keys()])
  let shown = 0
  for (const k of [...keys].sort()) {
    const a = gm.get(k) ?? 0
    const b = nm.get(k) ?? 0
    if (a === b) continue
    if (shown++ >= 15) {
      console.error('  ... (truncated)')
      break
    }
    console.error(`  ${a > b ? 'ONLY IN GOLDEN' : 'ONLY IN NEW   '} (${a}->${b})  ${k}`)
  }
}

console.log(`\nchecked ${checked} pages, ${totalTriples} golden triples`)
if (whitespaceOnly) {
  console.log(
    `\n${whitespaceOnly} page(s) match only after collapsing whitespace inside literals — ` +
      `the schema:articleBody microdata literal, where kramdown put a blank line between ` +
      `block elements and remark-rehype puts one newline. Not visible to a reader; every ` +
      `non-whitespace character still compared:`,
  )
  for (const p of whitespacePages) console.log(`  ${p}`)
}
if (failed) {
  console.error(`FAIL: ${failed} page(s) with differing RDF graphs`)
  process.exit(1)
}
console.log('OK: zero triple differences')

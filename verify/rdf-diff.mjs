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

const termKey = (t) => {
  if (t.termType === 'Literal') {
    return `"${t.value}"^^<${t.datatype.value}>${t.language ? `@${t.language}` : ''}`
  }
  if (t.termType === 'BlankNode') return '_:'
  return `<${t.value}>`
}
const quadKey = (q) =>
  `${termKey(q.subject)} ${termKey(q.predicate)} ${termKey(q.object)} ${q.graph.value ? `<${q.graph.value}>` : ''}`

const goldenFiles = listHtml(goldenDir)
const newSet = new Set(listHtml(newDir))

let checked = 0
let failed = 0
let totalTriples = 0

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

  failed++
  console.error(`\n══ ${f} ══  golden ${gq.length} triples, new ${nq.length}`)
  const gm = new Map()
  for (const q of gq) gm.set(quadKey(q), (gm.get(quadKey(q)) ?? 0) + 1)
  const nm = new Map()
  for (const q of nq) nm.set(quadKey(q), (nm.get(quadKey(q)) ?? 0) + 1)
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
if (failed) {
  console.error(`FAIL: ${failed} page(s) with differing RDF graphs`)
  process.exit(1)
}
console.log('OK: zero triple differences')

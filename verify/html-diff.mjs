#!/usr/bin/env node
// Whole-tree structural HTML diff (plan §7.2).
//
//   node verify/html-diff.mjs <golden-dir> <new-dir> [--only <substring>] [--limit N]
//
// Exits non-zero on any file-tree difference or any unjustified DOM difference.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { canonicalize, diffTrees } from './lib/dom.mjs'
import { JUSTIFIED, normalizeHtml, normalizeXml, countStylesheetLinks } from './lib/normalize.mjs'

const [goldenDir, newDir] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? undefined : process.argv[i + 1]
}
const only = flag('only')
const limit = Number(flag('limit') ?? 40)

if (!goldenDir || !newDir) {
  console.error('usage: html-diff.mjs <golden-dir> <new-dir> [--only substr] [--limit N]')
  process.exit(2)
}

// Files the new build is expected to add, with justification (plan §6.8).
const EXPECTED_EXTRA = [
  {
    match: (p) => p === '.well-known/nostr.json',
    why:
      'Jekyll never published it: EntryFilter treats dot-prefixed paths as special and ' +
      "configuration.rb's `include` lists only .htaccess, so the NIP-05 identity file " +
      'never reached _site. Astro publishes public/.well-known/**. Intentional (plan §6.8).',
  },
  {
    match: (p) => p.startsWith('_astro/'),
    why: 'Astro bundle output directory (hashed CSS). Counterpart of css/main.css.',
  },
]
const EXPECTED_MISSING = [
  {
    match: (p) => p === 'css/main.css',
    why: 'Replaced by the content-hashed /_astro/main.<hash>.css (see _astro/ above).',
  },
]

function listFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(dir, p).split(sep).join('/'))
    }
  }
  walk(dir)
  return out.sort()
}

const goldenFiles = listFiles(goldenDir)
const newFiles = listFiles(newDir)
const goldenSet = new Set(goldenFiles)
const newSet = new Set(newFiles)

let failures = 0
const notes = []

const extra = newFiles.filter((f) => !goldenSet.has(f))
const missing = goldenFiles.filter((f) => !newSet.has(f))

for (const f of extra) {
  const e = EXPECTED_EXTRA.find((x) => x.match(f))
  if (e) notes.push(`+ ${f}\n    ${e.why}`)
  else {
    console.error(`UNEXPECTED EXTRA FILE: ${f}`)
    failures++
  }
}
for (const f of missing) {
  const e = EXPECTED_MISSING.find((x) => x.match(f))
  if (e) notes.push(`- ${f}\n    ${e.why}`)
  else {
    console.error(`MISSING FILE: ${f}`)
    failures++
  }
}

const shared = goldenFiles.filter((f) => newSet.has(f))
const html = shared.filter((f) => f.endsWith('.html'))
const xml = shared.filter((f) => f.endsWith('.xml'))
const binary = shared.filter((f) => !f.endsWith('.html') && !f.endsWith('.xml'))

let compared = 0
let differing = 0

for (const f of [...html, ...xml]) {
  if (only && !f.includes(only)) continue
  compared++
  const isXml = f.endsWith('.xml')
  let g = readFileSync(join(goldenDir, f), 'utf8')
  let n = readFileSync(join(newDir, f), 'utf8')
  if (isXml) {
    g = normalizeXml(g)
    n = normalizeXml(n)
    if (g !== n) {
      differing++
      failures++
      console.error(`\n══ ${f} ══`)
      const gl = g.split('\n')
      const nl = n.split('\n')
      for (let i = 0; i < Math.max(gl.length, nl.length); i++) {
        if (gl[i] !== nl[i]) {
          console.error(`  line ${i + 1}\n    golden: ${JSON.stringify(gl[i])}\n    new:    ${JSON.stringify(nl[i])}`)
        }
      }
    }
    continue
  }
  // The stylesheet link is stripped by normalizeHtml, so verify it exists on both sides.
  const gs = countStylesheetLinks(g)
  const ns = countStylesheetLinks(n)
  if (gs !== ns || gs !== 1) {
    failures++
    console.error(`\n══ ${f} ══\n  site stylesheet <link> count: golden ${gs}, new ${ns} (expected 1 each)`)
  }

  const gt = canonicalize(normalizeHtml(g))
  const nt = canonicalize(normalizeHtml(n))
  const d = diffTrees(gt, nt, '', [], limit)
  if (d.length) {
    differing++
    failures++
    console.error(`\n══ ${f} ══`)
    for (const line of d) console.error('  ' + line)
  }
}

// Non-markup files (images, ads.txt, ...) must be byte-identical.
for (const f of binary) {
  if (only && !f.includes(only)) continue
  const g = readFileSync(join(goldenDir, f))
  const n = readFileSync(join(newDir, f))
  if (!g.equals(n)) {
    failures++
    console.error(`\n══ ${f} ══\n  byte content differs (${g.length} vs ${n.length} bytes)`)
  }
}

console.log(`\ncompared ${compared} markup files (${html.length} html, ${xml.length} xml), ${binary.length} other`)
if (notes.length) {
  console.log(`\n${notes.length} justified file-tree difference(s):`)
  for (const n of notes) console.log('  ' + n)
}
console.log(`\nJustified content normalisations applied:`)
for (const j of JUSTIFIED) console.log(`  ${j.id}: ${j.why}`)

if (failures) {
  console.error(`\nFAIL: ${differing} file(s) with structural differences, ${failures} problem(s) total`)
  process.exit(1)
}
console.log('\nOK: zero unexplained differences')

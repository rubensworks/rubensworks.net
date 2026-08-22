#!/usr/bin/env node
// Per-character colour comparison of every highlighted code block (plan §6.7).
//
//   node verify/code-colors.mjs <golden-dir> <new-dir>
//
// The migration swapped Rouge's Pygments class names for a Shiki theme carrying the same
// colours as inline styles, so the markup diff deliberately ignores token spans. That makes
// the colours themselves the *only* thing standing between "visually equivalent" and a
// silently recoloured page — and a screenshot pass only sees the pages it happens to list.
//
// This resolves each visible character to its effective style on both sides: on the golden
// side by looking the Rouge class up in _sass/_syntax-highlighting.scss, on the new side by
// reading Shiki's inline style. Any character whose colour, weight or slant differs is a
// finding.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { parse } from 'parse5'

const [goldenDir = '_site_golden', newDir = 'dist'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const verbose = process.argv.includes('--verbose')
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7)

/** Expands #abc to #aabbcc and lowercases, so the two sides are comparable. */
function normColor(c) {
  if (!c) return null
  let v = c.trim().toLowerCase()
  if (/^#[0-9a-f]{3}$/.test(v)) v = '#' + [...v.slice(1)].map((d) => d + d).join('')
  return v
}

/** Reads the Rouge token styles out of the site's own stylesheet. */
function loadRougeStyles(path = '_sass/_syntax-highlighting.scss') {
  const styles = new Map()
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*\.([a-z0-9]+)\s*\{([^}]*)\}/.exec(line)
    if (!m) continue
    const body = m[2]
    styles.set(m[1], {
      color: normColor(/color:\s*([^;]+)/.exec(body)?.[1]) ?? '#000000',
      bold: /font-weight:\s*bold/.test(body),
      italic: /font-style:\s*italic/.test(body),
    })
  }
  return styles
}

const DEFAULT = { color: '#000000', bold: false, italic: false }
const styleKey = (s) => `${s.color}${s.bold ? ' bold' : ''}${s.italic ? ' italic' : ''}`

/** Effective style of an inline `style` attribute, as Shiki emits it. */
function styleFromAttr(attr, inherited) {
  if (!attr) return inherited
  return {
    color: normColor(/(?:^|;)\s*color:\s*([^;]+)/.exec(attr)?.[1]) ?? inherited.color,
    bold: /font-weight:\s*(bold|[6-9]00)/.test(attr) || inherited.bold,
    italic: /font-style:\s*italic/.test(attr) || inherited.italic,
  }
}

const attrOf = (node, name) => (node.attrs ?? []).find((a) => a.name === name)?.value

/** Collects [char, style] for every character inside a <code>, following span nesting. */
function chars(node, style, rouge, out = []) {
  for (const child of node.childNodes ?? []) {
    if (child.nodeName === '#text') {
      for (const ch of child.value) out.push([ch, style])
      continue
    }
    if (child.tagName !== 'span') {
      chars(child, style, rouge, out)
      continue
    }
    const cls = (attrOf(child, 'class') ?? '').split(/\s+/).filter(Boolean)
    const fromClass = cls.map((c) => rouge.get(c)).filter(Boolean).at(-1)
    const next = fromClass ?? styleFromAttr(attrOf(child, 'style'), style)
    chars(child, next, rouge, out)
  }
  return out
}

function codeBlocks(html) {
  const blocks = []
  const walk = (node, inPre = false) => {
    const isPre = node.tagName === 'pre' && (attrOf(node, 'class') ?? '').split(/\s+/).includes('highlight')
    if (node.tagName === 'code' && inPre) blocks.push(node)
    for (const c of node.childNodes ?? []) walk(c, inPre || isPre)
  }
  walk(parse(html))
  return blocks
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

const rouge = loadRougeStyles()
const shapes = new Map()
const perPage = []
let totalChars = 0
let totalBad = 0

for (const f of listHtml(goldenDir)) {
  if (only && !f.includes(only)) continue
  let g, n
  try {
    g = readFileSync(join(goldenDir, f), 'utf8')
    n = readFileSync(join(newDir, f), 'utf8')
  } catch {
    continue
  }
  const gb = codeBlocks(g)
  const nb = codeBlocks(n)
  if (gb.length === 0 && nb.length === 0) continue
  if (gb.length !== nb.length) {
    console.error(`${f}: ${gb.length} code blocks on golden, ${nb.length} on new`)
    totalBad++
    continue
  }

  let pageChars = 0
  let pageBad = 0
  for (let i = 0; i < gb.length; i++) {
    const gc = chars(gb[i], DEFAULT, rouge).filter(([c]) => c.trim() !== '')
    const nc = chars(nb[i], DEFAULT, rouge).filter(([c]) => c.trim() !== '')
    if (gc.length !== nc.length) {
      console.error(`${f} block ${i}: ${gc.length} visible chars on golden, ${nc.length} on new`)
      totalBad++
      continue
    }
    for (let j = 0; j < gc.length; j++) {
      pageChars++
      const gk = styleKey(gc[j][1])
      const nk = styleKey(nc[j][1])
      if (gk === nk) continue
      pageBad++
      const key = `${gk.padEnd(20)} -> ${nk}`
      const entry = shapes.get(key) ?? { count: 0, samples: [] }
      entry.count++
      if (entry.samples.length < 4) {
        const around = gc.slice(Math.max(0, j - 20), j + 21).map(([c]) => c).join('')
        entry.samples.push(`${JSON.stringify(gc[j][0])} in ${JSON.stringify(around)}`)
      }
      shapes.set(key, entry)
    }
  }
  totalChars += pageChars
  totalBad += pageBad
  if (pageChars) perPage.push({ f, pageChars, pageBad })
}

perPage.sort((a, b) => b.pageBad - a.pageBad)
console.log('pages with code blocks:')
for (const p of perPage) {
  const pct = ((p.pageBad / p.pageChars) * 100).toFixed(1)
  console.log(`  ${p.pageBad === 0 ? 'OK  ' : 'DIFF'} ${p.f}  ${p.pageBad}/${p.pageChars} chars (${pct}%)`)
}

if (shapes.size) {
  console.log('\nrecolouring by shape (golden -> new):')
  for (const [key, v] of [...shapes.entries()].sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${String(v.count).padStart(5)}  ${key}`)
    if (verbose) for (const s of v.samples) console.log(`         ${JSON.stringify(s)}`)
  }
}

console.log(`\n${totalBad} of ${totalChars} visible code characters differ in colour, weight or slant`)
if (totalBad) process.exit(1)
console.log('OK: every code character renders in the same style as Rouge')

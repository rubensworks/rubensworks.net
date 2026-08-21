// Structural HTML comparison (plan §7.2).
//
// A byte diff is useless here: Liquid leaves hundreds of whitespace-only artefacts that
// Astro will never reproduce, and they are invisible to visitors. So both sides are parsed
// and reduced to a canonical tree where only things a browser can observe survive:
// element names, attributes (sorted, with class/style/rel normalised) and text content
// with insignificant whitespace collapsed.

import { parse } from 'parse5'

// Whitespace is rendered verbatim inside these, so it is compared verbatim. The BibTeX
// block on the 92 detail pages is a <pre>, which makes this the strictest check in the
// suite. <script>/<style> are deliberately NOT here: their indentation is invisible to
// visitors, and comparing their *collapsed* text still catches any real change.
const PRE = new Set(['pre', 'textarea'])

// Space-separated token attributes. Jekyll and Astro can legitimately emit these in a
// different order (or with different padding) without changing meaning to a browser or an
// RDFa parser, so they are compared as sets.
const TOKEN_ATTRS = new Set(['class', 'rel', 'itemprop', 'property', 'typeof'])

const collapse = (s) => s.replace(/\s+/g, ' ')

// Elements for which the whitespace between two siblings is rendered rather than discarded,
// because they lay out inline: the HTML defaults, plus every tag the site's own SCSS
// switches to `display: inline` or `inline-block`. Dropping such a space moves the layout —
// it is what separates the nav links, and losing it hid a real regression that only the
// screenshot pass caught.
//
// This is a tag list, not a cascade: an element made inline by a rule this misses would
// have its separating space discarded, and a change there would slip past *this* check.
// verify/screenshots.mjs is the backstop, which is how the nav regression surfaced in the
// first place. Grepping _sass for `display: inline` is what keeps the second group honest.
const INLINE = new Set([
  'a', 'abbr', 'b', 'bdo', 'br', 'button', 'cite', 'code', 'dfn', 'em', 'i', 'img', 'input',
  'kbd', 'label', 'map', 'object', 'q', 'samp', 'select', 'small', 'span', 'strong', 'sub',
  'sup', 'textarea', 'time', 'tt', 'var',
  // From _sass: `.cv-listing … p`, `.toggle` and `.icon > svg`.
  'p', 'svg',
])
// `li` is deliberately not in the set even though `.authors li` and `.social-media-list li`
// are inline. Those lists carry `li:after { content: ", " }` / `padding-right`, which puts a
// space between the items regardless, so the whitespace-only node between `</li>` and `<li>`
// collapses into it and renders identically whether it is there or not — Jekyll emits one and
// Astro does not. Including `li` reports all 92 publication pages as different, and the
// screenshot pass confirms they are not.

const isInline = (node) => node !== undefined && node.n !== undefined && INLINE.has(node.n)

function normStyle(v) {
  return v
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':')
      return i < 0 ? d : `${d.slice(0, i).trim()}:${d.slice(i + 1).trim()}`
    })
    .sort()
    .join(';')
}

function normAttrValue(name, value) {
  if (name === 'style') return normStyle(value)
  if (TOKEN_ATTRS.has(name)) return value.split(/\s+/).filter(Boolean).sort().join(' ')
  // Attributes carrying URLs or prose keep their value, but runs of whitespace (including
  // the newlines Liquid injects into `content=` attributes) are collapsed.
  return collapse(value).trim()
}

function normAttrs(node, opts) {
  const out = {}
  for (const a of node.attrs ?? []) {
    const name = a.name.toLowerCase()
    if (opts.ignoreAttrs?.(node.tagName, name, a.value)) continue
    out[name] = normAttrValue(name, a.value)
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)))
}

function walk(node, opts, inPre = false) {
  if (node.nodeName === '#text') {
    // Whitespace-only nodes are kept here and resolved by the sibling pass below, which is
    // the only place that can tell a rendered inter-inline space from mere indentation.
    return { t: inPre ? node.value : collapse(node.value) }
  }
  if (node.nodeName === '#comment') {
    return opts.keepComments ? { c: collapse(node.data).trim() } : null
  }
  if (node.nodeName === '#documentType') return { d: node.name }
  if (!node.tagName && !node.childNodes) return null

  const tag = node.tagName ?? node.nodeName
  const pre = inPre || PRE.has(tag)
  const children = []
  for (const c of node.childNodes ?? []) {
    const n = walk(c, opts, pre)
    if (n !== null) children.push(n)
  }
  // Merge adjacent text nodes, then re-trim: `<span>a</span> <span>b</span>` and
  // `<span>a</span>\n<span>b</span>` are the same document.
  const merged = []
  for (const c of children) {
    const last = merged[merged.length - 1]
    if (c.t !== undefined && last?.t !== undefined) last.t += c.t
    else merged.push(c)
  }
  if (!pre) {
    for (const c of merged) if (c.t !== undefined) c.t = collapse(c.t)
    // Whitespace-only text nodes are dropped — with one exception. Between two inline-level
    // elements, whitespace collapses to a rendered space and moves the layout: this is what
    // separates the inline-block nav links, and dropping it hid a real regression that only
    // the screenshot pass caught. So it survives as a single space, and any *other*
    // whitespace-only node (block layout, indentation) is discarded as noise.
    for (let i = merged.length - 1; i >= 0; i--) {
      const c = merged[i]
      if (c.t === undefined) continue
      if (c.t.trim() !== '') {
        c.t = c.t.trim()
        continue
      }
      if (c.t !== '' && isInline(merged[i - 1]) && isInline(merged[i + 1])) c.t = ' '
      else merged.splice(i, 1)
    }
  }
  if (node.nodeName === '#document' || node.nodeName === '#document-fragment') {
    return { n: '#doc', k: merged }
  }
  return { n: tag, a: normAttrs(node, opts), k: merged }
}

export function canonicalize(html, opts = {}) {
  return walk(parse(html), opts)
}

/** Depth-first structural comparison; returns human-readable difference paths. */
export function diffTrees(a, b, path = '', out = [], limit = 40) {
  if (out.length >= limit) return out
  if (a === undefined || b === undefined) {
    out.push(`${path}: ${a === undefined ? 'missing on golden' : 'missing on new'} -> ${describe(a ?? b)}`)
    return out
  }
  if (a.t !== undefined || b.t !== undefined) {
    if (a.t !== b.t) out.push(`${path}/#text\n    golden: ${JSON.stringify(a.t)}\n    new:    ${JSON.stringify(b.t)}`)
    return out
  }
  if (a.c !== undefined || b.c !== undefined) {
    if (a.c !== b.c) out.push(`${path}/#comment\n    golden: ${JSON.stringify(a.c)}\n    new:    ${JSON.stringify(b.c)}`)
    return out
  }
  if (a.d !== undefined || b.d !== undefined) {
    if (a.d !== b.d) out.push(`${path}/!doctype golden=${a.d} new=${b.d}`)
    return out
  }
  if (a.n !== b.n) {
    out.push(`${path}: element <${a.n}> vs <${b.n}>`)
    return out
  }
  const here = `${path}/${a.n}`
  const keys = new Set([...Object.keys(a.a ?? {}), ...Object.keys(b.a ?? {})])
  for (const k of [...keys].sort()) {
    const av = a.a?.[k]
    const bv = b.a?.[k]
    if (av !== bv) {
      out.push(`${here}[@${k}]\n    golden: ${av === undefined ? '<absent>' : JSON.stringify(av)}\n    new:    ${bv === undefined ? '<absent>' : JSON.stringify(bv)}`)
      if (out.length >= limit) return out
    }
  }
  const ak = a.k ?? []
  const bk = b.k ?? []
  if (ak.length !== bk.length) {
    out.push(`${here}: ${ak.length} children on golden, ${bk.length} on new\n    golden: ${ak.map(describe).join(' ')}\n    new:    ${bk.map(describe).join(' ')}`)
  }
  for (let i = 0; i < Math.max(ak.length, bk.length); i++) {
    diffTrees(ak[i], bk[i], `${here}[${i}]`, out, limit)
    if (out.length >= limit) break
  }
  return out
}

function describe(n) {
  if (!n) return '<none>'
  if (n.t !== undefined) return `#text(${JSON.stringify(n.t.slice(0, 60))})`
  if (n.c !== undefined) return '#comment'
  if (n.d !== undefined) return '!doctype'
  const cls = n.a?.class ? `.${n.a.class.split(' ').join('.')}` : ''
  return `<${n.n}${cls}>`
}

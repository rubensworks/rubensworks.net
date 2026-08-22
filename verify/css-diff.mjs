#!/usr/bin/env node
// Structural comparison of the site stylesheet (plan §6.3).
//
//   node verify/css-diff.mjs [golden-css] [new-css]
//
// The HTML diff ignores the stylesheet's filename because Astro fingerprints it, which also
// means nothing else in the suite looks *inside* it. Both files are built from the same
// unchanged `_sass/`, so any difference comes from the new toolchain — and Astro runs the
// result through esbuild's minifier, which is free to rewrite syntax the old browsers this
// site still serves may not understand. `(max-width: 600px)` becoming the Media Queries
// Level 4 `(width <= 600px)` is exactly that: valid CSS, dropped whole by Safari below 16.4.
//
// Two things are checked, both of them things a minifier must never change:
//
//   * every at-rule prelude — the media conditions the layout switches on;
//   * every selector, split out of its comma group and keyed by the at-rules around it.
//
// Declaration *values* are deliberately not compared. A minifier legitimately rewrites
// `bold` to `700`, `white` to `#fff`, `solid 2px red` to `2px solid red`, folds `calc()`,
// merges `background-color` into `background` and prunes vendor prefixes it knows the
// target browsers no longer need — deciding which of those are equivalent would mean
// writing a CSS equivalence engine and trusting it. The rendered values are covered instead
// by verify/screenshots.mjs, which compares the pages pixel by pixel.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function findAstroCss(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith('.css'))
  if (files.length !== 1) {
    throw new Error(`expected exactly one stylesheet in ${dir}, found ${files.length}`)
  }
  return join(dir, files[0])
}

const goldenPath = process.argv[2] ?? '_site_golden/css/main.css'
const newPath = process.argv[3] ?? findAstroCss('dist/_astro')

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Whitespace, casing and `::before`/`:before` differences are not the minifier's doing. */
const canon = (s) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~])\s*/g, '$1')
    .replace(/\(\s*/g, '(')
    .replace(/\s*\)/g, ')')
    .replace(/\s*:\s*/g, ':')
    .replace(/::(before|after|first-line|first-letter)\b/g, ':$1')

/**
 * Walks the block structure and yields `{ context, selector }` for every rule, where
 * `context` is the at-rule preludes enclosing it. Declarations are not retained.
 */
function collect(css) {
  const selectors = new Set()
  const atRules = new Set()
  const stack = []
  let buf = ''
  for (const ch of stripComments(css)) {
    if (ch === '{') {
      const head = buf.trim()
      buf = ''
      if (head.startsWith('@')) {
        const at = canon(head)
        atRules.add([...stack.filter((s) => s.startsWith('@')), at].join(' | '))
        stack.push(at)
      } else {
        const context = stack.filter((s) => s.startsWith('@')).join(' | ')
        // Split the comma group: minifiers merge and reorder rules that share a body.
        for (const sel of head.split(',')) {
          if (sel.trim()) selectors.add(`${context ? context + ' | ' : ''}${canon(sel)}`)
        }
        stack.push(canon(head))
      }
      continue
    }
    if (ch === '}') {
      stack.pop()
      buf = ''
      continue
    }
    if (ch === ';' && !stack.length) {
      if (buf.trim().startsWith('@')) atRules.add(canon(buf))
      buf = ''
      continue
    }
    buf += ch
  }
  return { selectors, atRules }
}

const golden = collect(readFileSync(goldenPath, 'utf8'))
const fresh = collect(readFileSync(newPath, 'utf8'))

let failures = 0
const compare = (what, a, b) => {
  for (const v of a) {
    if (!b.has(v)) {
      console.log(`  LOST   ${what}  ${v}`)
      failures++
    }
  }
  for (const v of b) {
    if (!a.has(v)) {
      console.log(`  NEW    ${what}  ${v}`)
      failures++
    }
  }
}

console.log(`${goldenPath}: ${golden.selectors.size} selectors, ${golden.atRules.size} at-rules`)
console.log(`${newPath}: ${fresh.selectors.size} selectors, ${fresh.atRules.size} at-rules`)

compare('at-rule ', golden.atRules, fresh.atRules)
compare('selector', golden.selectors, fresh.selectors)

if (failures) {
  console.error(`\n${failures} difference(s) between the two stylesheets`)
  process.exit(1)
}
console.log('OK: same selectors under the same at-rules')

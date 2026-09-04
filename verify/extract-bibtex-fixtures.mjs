#!/usr/bin/env node
// Extracts the 92 golden `<pre class="bibtex content">` blocks from the Jekyll baseline into
// test/fixtures/bibtex-blocks.json (plan §9).
//
//   node verify/extract-bibtex-fixtures.mjs [_site_golden]
//
// These fixtures are the ground truth for src/lib/bibtex-serialise.ts, the one part of
// jekyll-scholar that had never been reproduced. Re-run only if the baseline is rebuilt.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'parse5'

const goldenDir = process.argv[2] ?? '_site_golden'
const out = 'test/fixtures/bibtex-blocks.json'

const findPre = (node, acc = []) => {
  if (node.tagName === 'pre' && (node.attrs ?? []).some((a) => a.name === 'class' && a.value.split(/\s+/).includes('bibtex'))) {
    acc.push(node)
  }
  for (const c of node.childNodes ?? []) findPre(c, acc)
  return acc
}

const textOf = (node) =>
  (node.childNodes ?? []).map((c) => (c.nodeName === '#text' ? c.value : textOf(c))).join('')

const blocks = {}
for (const dir of readdirSync(join(goldenDir, 'publications'))) {
  if (dir === 'index.html') continue
  const pres = findPre(parse(readFileSync(join(goldenDir, 'publications', dir, 'index.html'), 'utf8')))
  if (pres.length !== 1) throw new Error(`${dir}: expected 1 <pre class="bibtex">, found ${pres.length}`)
  blocks[dir] = textOf(pres[0])
}

writeFileSync(out, JSON.stringify(blocks, null, 2) + '\n')
console.log(`extracted ${Object.keys(blocks).length} BibTeX blocks -> ${out}`)

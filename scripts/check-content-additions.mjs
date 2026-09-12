#!/usr/bin/env node
// Adding content must not require touching the tests.
//
//   node scripts/check-content-additions.mjs
//
// Adds one entry to every input surface — a publication, a post, a project, and each
// _data/*.yml — then runs the tests, the build and the link check, and asserts the new
// content actually reached the pages it belongs on. Everything is restored afterwards.
//
// The point is the *combination*. Tests passing is not enough on its own: an entry can be
// silently dropped from a page and nothing fails. And rendering is not enough either: a
// hard-coded `toHaveLength(92)` or a fixture compared by equality turns an ordinary edit to
// references.bib into a failing build for no reason. This catches both.

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Each entry exercises something the pipeline has to get right, not just the happy path:
// a name list wrapped across lines, a LaTeX accent, a `%` in a URL and in a title, an entry
// with no month, an ISO-style date, a talk scheduled beyond the current year, and a post
// using the kramdown constructs (inline attribute lists, markdown="block", digit headings).
const ADDITIONS = [
  {
    path: '_bibliography/references.bib',
    content: `
@inproceedings{smoke_conference_2027,
  author = {Doe, Jane and
            Gal{\\'a}rraga, Luis and Taelman, Ruben},
  title = {A Brand New Paper About 100% of Things},
  booktitle = {Proceedings of the 1st Imaginary Conference},
  year = {2027},
  month = {march},
  _type = {Conference},
  _highlighted = {true},
  abstract = {An abstract
     that wraps  across lines.},
  url = {https://example.org/a%20paper},
}

@mastersthesis{smoke_nomonth_2016,
  author = {Roe, Richard},
  title = {An Older Thesis With No Month},
  school = {Imaginary University},
  year = {2016},
  _type = {Master's Thesis},
}
`,
  },
  {
    path: '_data/knows.yml',
    content: `"Jane Doe":\n  url: "https://example.org/jane"\n  foaf: "https://example.org/jane#me"\n`,
  },
  {
    path: '_data/presentations.yml',
    content: `"2027-smoke-iso":
    title: "A Talk Dated The ISO Way"
    venue: "Imaginary Conference"
    type: "Keynote"
    date: "2027-03-01"
    url: "https://example.org/talk"
"2028-smoke-future":
    title: "A Talk Scheduled Two Years Out"
    venue: "Elsewhere"
    type: "Invited Talk"
    date: "4 May 2028"
    url: "https://example.org/talk2"
`,
  },
  {
    path: '_data/studentsphd.yml',
    content: `"Imaginary PhD Student":
    startdate: 09-2027
    enddate: now
    location: "Ghent University, Belgium"
    title: A thesis about imaginary things
`,
  },
  {
    path: '_data/studentsmaster.yml',
    content: `"Imaginary Master Student":
    startdate: 2027
    enddate: 2028
    location: "Ghent University, Belgium"
    title: A dissertation about imaginary things
`,
  },
  {
    path: '_posts/2027-06-01-a-brand-new-post.markdown',
    create: true,
    content: `---
layout:      post
categories:  blog
tags:        [ testing, rdf ]
comments:    true
title:       "A brand new post"
subtitle:    "Checking that adding a post needs no test changes."
date:        2027-06-01 09:00:00 +0200
---
<p class="post-abstract" markdown="1">
This is the _excerpt_, with a [link](https://example.org/).
</p>
<!--more-->

## A heading with 1. digits and JSON-LD in it

Some prose with \`inline code\` and a fenced block:

\`\`\`javascript
const x = require("rdf-parse").default;
\`\`\`
{:#smoke-listing .hide}

<figure id="smoke-fig" class="listing" markdown="block">
\`\`\`json
{"@context": {"@vocab": "http://schema.org/"}}
\`\`\`
<figcaption markdown="block">
<span class="label">Listing 1</span>
Adapted from [somewhere](https://example.org/).
</figcaption>
</figure>
`,
  },
  {
    path: '_projects/smoketest.html',
    create: true,
    content: `---
layout: project
title:  "SmokeTest"
start:  "January 2027"
description: "An imaginary project"
weight: 99
---

<p>
  A project body that is plain HTML.
</p>
`,
  },
]

/** [file, what must appear in it, what it proves]. */
const MUST_RENDER = [
  ['blog/2027/06/01/a-brand-new-post/index.html', 'A brand new post', 'the post has its own page'],
  ['blog/index.html', 'a-brand-new-post', 'the post is listed on /blog/'],
  ['feed.xml', 'A brand new post', 'the post is in the feed'],
  ['blog/index.html', '<em>excerpt</em>', "the post's excerpt is rendered, not escaped"],
  ['blog/2027/06/01/a-brand-new-post/index.html', 'id="smoke-listing" class="hide', 'an inline attribute list still applies'],
  ['blog/2027/06/01/a-brand-new-post/index.html', '<figcaption>', 'markdown="block" is still expanded'],
  ['blog/2027/06/01/a-brand-new-post/index.html', 'id="a-heading-with-1-digits-and-json-ld-in-it"', 'heading slugs still keep digits and hyphens'],
  ['publications/smoke_conference_2027/index.html', 'itemprop="name"', 'the publication has its own page'],
  ['publications/smoke_nomonth_2016/index.html', 'An Older Thesis', 'a month-less entry still gets a page'],
  ['publications/index.html', 'smoke_conference_2027', 'it is listed on /publications/'],
  ['index.html', 'A Brand New Paper', '_highlighted puts it on the homepage'],
  ['cv/index.html', 'smoke_conference_2027', 'its _type puts it in the right CV section'],
  ['cv/index.html', 'smoke_nomonth_2016', "the Master's Thesis section picks it up too"],
  ['publications/smoke_conference_2027/index.html', 'Luis Galárraga', 'LaTeX accents are decoded'],
  ['publications/smoke_conference_2027/index.html', 'example.org/a%20paper', 'a % in a URL is not truncated'],
  ['publications/smoke_conference_2027/index.html', 'About 100% of Things', 'a % in a title is not truncated'],
  ['publications/smoke_conference_2027/index.html', 'example.org/jane', 'a new knows.yml entry links the author'],
  ['projects/smoketest/index.html', 'SmokeTest', 'the project has its own page'],
  ['projects/index.html', 'smoketest', 'it is listed on /projects/'],
  ['cv/index.html', 'Imaginary PhD Student', 'a new PhD student reaches the CV'],
  ['cv/index.html', 'Imaginary Master Student', "a new master's student reaches the CV"],
  ['presentations/index.html', 'A Talk Dated The ISO Way', 'an ISO-dated talk is placed by year'],
  ['presentations/index.html', 'A Talk Scheduled Two Years Out', 'a talk beyond this year is not dropped'],
  ['cv/index.html', 'A Talk Scheduled Two Years Out', 'it is counted on the CV as well'],
]

const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' })

const originals = new Map()
for (const { path, create } of ADDITIONS) {
  if (create && existsSync(path)) throw new Error(`${path} already exists; refusing to overwrite`)
  originals.set(path, create ? null : readFileSync(path, 'utf8'))
}

let failures = 0
try {
  for (const { path, content, create } of ADDITIONS) {
    writeFileSync(path, create ? content : originals.get(path) + content)
  }
  console.log(`added content to ${ADDITIONS.length} input files\n`)

  run('npx', ['vitest', 'run'])
  run('npx', ['astro', 'build'])
  run('node', ['scripts/check-links.mjs', 'dist'])

  console.log('\nchecking the new content actually rendered:')
  for (const [file, needle, why] of MUST_RENDER) {
    const html = existsSync(`dist/${file}`) ? readFileSync(`dist/${file}`, 'utf8') : ''
    const ok = html.includes(needle)
    if (!ok) failures++
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${why}`)
    if (!ok) console.error(`       expected ${JSON.stringify(needle)} in dist/${file}`)
  }
} finally {
  for (const [path, original] of originals) {
    if (original === null) rmSync(path, { force: true })
    else writeFileSync(path, original)
  }
  rmSync('dist', { recursive: true, force: true })
  console.log('\ninputs restored')
}

if (failures) {
  console.error(`\nFAIL: ${failures} piece(s) of new content did not reach the page`)
  process.exit(1)
}
console.log('OK: content can be added without touching the tests')

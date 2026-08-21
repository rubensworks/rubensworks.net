import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { loadBibliography, loadKnows, type Entry, type Knows } from './bibliography'
import { queryEntries } from './bibquery'
import { loadPresentations, presentationYear, type Presentation } from './presentations'
import { site } from '../site.config'

/**
 * A minimal Liquid renderer for `cv.md` and `reading_list.md`, so both files can stay
 * exactly as they are on disk.
 *
 * Rewriting them as `.astro` would mean hand-porting 55 `cv-listing` includes, 28 `book`
 * includes, 22 bibliography tags, two `{% for %}` loops over `_data/students*.yml` and four
 * attribute lists — a large mechanical diff with plenty of room for a silent transcription
 * slip. Expanding the Liquid instead and handing the result to the same Markdown pipeline
 * reproduces Jekyll's own order of operations (Liquid first, Markdown second), and leaves
 * the source files as the reviewable artefact.
 *
 * Only the constructs these two files actually use are implemented. Anything else — an
 * unknown include, an unsupported filter, a stray `{%` — throws, so an unhandled construct
 * fails the build instead of reaching a visitor.
 */

/** Renders a Markdown fragment to HTML — the same pipeline the page body uses. */
export type Render = (md: string) => Promise<string>

type Scope = Record<string, unknown>

interface Context {
  entries: Entry[]
  knows: Knows
  presentations: [string, Presentation][]
  /** `site.data.*` — the YAML tables cv.md loops over. */
  data: Record<string, Record<string, Record<string, unknown>>>
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** `String.replace` with an async replacer. */
async function asyncReplace(
  input: string,
  re: RegExp,
  replacer: (...args: string[]) => Promise<string>,
): Promise<string> {
  const matches = [...input.matchAll(re)]
  const values = await Promise.all(matches.map((m) => replacer(...(m as unknown as string[]))))
  let out = ''
  let last = 0
  matches.forEach((m, i) => {
    out += input.slice(last, m.index) + values[i]
    last = m.index! + m[0].length
  })
  return out + input.slice(last)
}

/** Resolves `student[0]`, `student[1].title`, or a plain variable, against the scope. */
function resolve(expr: string, scope: Scope, filePath: string): string {
  const m = /^(\w+)((?:\[\d+\]|\.\w+)*)$/.exec(expr.trim())
  if (!m) throw new Error(`${filePath}: unsupported Liquid expression "${expr}"`)
  let value: unknown = scope[m[1]!]
  if (value === undefined) throw new Error(`${filePath}: unknown Liquid variable "${m[1]}"`)
  for (const step of m[2]!.matchAll(/\[(\d+)\]|\.(\w+)/g)) {
    value =
      step[1] !== undefined
        ? (value as unknown[])[Number(step[1])]
        : (value as Scope)[step[2]!]
  }
  return value === undefined || value === null ? '' : String(value)
}

/**
 * Liquid include parameters. Values are either quoted literals — possibly spanning lines —
 * or bare identifiers naming a variable in scope (`subject=subject`, inside the student
 * loops).
 */
function parseParams(raw: string, scope: Scope, filePath: string): Record<string, string> {
  const params: Record<string, string> = {}
  // Values may contain backslash-escaped quotes: reading_list.md quotes book excerpts.
  const re = /([a-zA-Z_][\w-]*)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([\w.[\]]+))/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    // `presentations=site.data.presentations` just names the table the include iterates;
    // the port takes it from the context instead, so the reference itself is dropped.
    if (m[3]?.startsWith('site.data.')) continue
    params[m[1]!] = m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : resolve(m[3]!, scope, filePath)
  }
  return params
}

/**
 * Port of `_includes/cv-listing.html`.
 *
 * `markdownify` runs each value through kramdown as a *block*, so even a bare phrase comes
 * back wrapped in a paragraph — visible in the golden output as
 * `<span class="cv-listing-subject"><p>Assistant Professor</p>\n</span>`. The whitespace
 * from the template's untaken `{% if %}` branches is reproduced too, since it ends up in
 * the page.
 */
async function cvListing(p: Record<string, string>, render: Render): Promise<string> {
  const md = (v: string) => render(v)
  const optional = async (value: string | undefined, cls: string, markdown: boolean) =>
    value === undefined
      ? '\n    '
      : `\n    <span class="${cls}">${markdown ? await md(value) : value}</span>\n    `
  return (
    '<li>' +
    `\n    <span class="cv-listing-subject">${await md(p.subject ?? '')}</span>` +
    (await optional(p.date, 'cv-listing-period', false)) +
    (await optional(
      p.startdate === undefined ? undefined : `${p.startdate} - ${p.enddate ?? ''}`,
      'cv-listing-period',
      false,
    )) +
    (await optional(p.subtitle, 'cv-listing-subtitle', true)) +
    (await optional(p.location, 'cv-listing-location', true)) +
    (await optional(p.authors, 'cv-listing-authors', true)) +
    `\n    <span class="cv-listing-description">${await md(p.description ?? '')}</span>` +
    '\n</li>'
  )
}

/** Port of `_includes/book.html`. */
function book(p: Record<string, string>): string {
  return `<div class="book">
  <div class="book-left">
    <a href="${p.link}" target="_blank"><img src="${p.img}" alt="${escapeHtml(`${p.title} by ${p.authors}`)}" /></a>
  </div>
  <div class="book-right">
    <h3><a href="${p.link}" target="_blank">${p.title}</a></h3>
    <p class="authors">${p.authors}</p>
    <p class="description">
      ${p.description}
    </p>
  </div>
</div>`
}

/**
 * Port of `_includes/presentations.html`.
 *
 * The condition is `presentation_year == include.year or include.types contains type`.
 * `cv.md` passes `types` and no `year`, so only the second half applies; Liquid's `contains`
 * on a string is a substring test.
 */
function presentations(p: Record<string, string>, entries: [string, Presentation][]): string {
  const year = p.year !== undefined ? Number(p.year) : undefined
  const types = p.types
  const items = entries
    .filter(
      ([id, pres]) =>
        (year !== undefined && presentationYear(id, pres) === year) ||
        (types !== undefined && types.includes(pres.type)),
    )
    .map(
      ([id, pres]) => `    <li>
    <div class="presentation listed" itemscope itemtype="http://schema.org/PresentationDigitalDocument" typeof="schema:PresentationDigitalDocument schema:CreativeWork" about="/presentations#${id}">
        <span class="type">${pres.type}</span>
        <span itemprop="name" property="schema:name" class="title"><a href="${pres.url}">${pres.title}</a></span>
        <span itemprop="location" property="schema:location" class="venue">${pres.venue}</span>
        <span itemprop="datePublished" property="schema:datePublished" class="date">${pres.date}</span>
    </div>
    </li>`,
    )
    .join('\n')
  return `<ol class="presentations">\n${items}\n</ol>`
}

/** One bibliography entry, as `_layouts/bib.html` renders it. */
function bibEntry(entry: Entry, knows: Knows): string {
  const authors = entry.authors
    .map((author, i) => {
      const k = knows[author.display]
      const prefix = '\n      <li>\n      \n      \n      \n      '
      if (!k) return `${prefix}<span itemprop="author">${escapeHtml(author.display)}</span></li>`
      return (
        prefix +
        `<a class="author" itemprop="author" rel="foaf:maker schema:creator schema:author" href="${k.url}" resource="${k.foaf}" target="_blank">${escapeHtml(author.display)}</a>` +
        '<span property="bibframe:contribution" style="display:none" typeof="bibframe:Contribution">' +
        `<a property="bibframe:agent" style="display:none" href="${k.foaf}"></a>` +
        `<span property="vivo:rank" style="display:none">${i}</span></span></li>`
      )
    })
    .join('')
  const container = entry.booktitle ?? entry.journal
  const inLine = container
    ? `\n  <span class="in">In ${escapeHtml(container)} (${entry.year})</span>\n  `
    : '\n  \n  '
  return `<div class="publication listed" itemscope itemtype="http://schema.org/ScholarlyArticle" typeof="schema:ScholarlyArticle schema:CreativeWork" about="/publications/${entry.key}/#publication">
  <span class="type">${escapeHtml(entry._type ?? '')}</span>
  <a href="/publications/${entry.key}" class="title" about="/publications/${entry.key}/#publication"><span itemprop="name" property="schema:name">${escapeHtml(entry.title)}</span></a><br />
  <ol class="authors">${authors}</ol>${inLine}
  <span property="schema:abstract" style="display:none">${escapeHtml(entry.abstract ?? '')}</span>
  <span property="schema:datePublished" style="display:none" datatype="xsd:gYear">${entry.year}</span>
  <a rel="schema:contributor" style="display:none" href="https://data.knows.idlab.ugent.be/person/office/#"></a>
  <a rel="schema:about" style="display:none" href="http://dbpedia.org/resource/Semantic_Web"></a>
</div>`
}

/** `{% bibliography %}` — the ungrouped list cv.md uses. */
function bibliography(entries: Entry[], knows: Knows): string {
  const items = entries
    .map(
      (e) =>
        `<li>${bibEntry(e, knows)}<a class="${site.scholar.detailsLinkClass}" href="/${site.scholar.detailsDir}/${e.key}/">${site.scholar.detailsLink}</a></li>`,
    )
    .join('')
  return `<ol class="bibliography">${items}</ol>`
}

const TAG = /\{%\s*([\s\S]*?)\s*%\}/g
const OUTPUT = /\{\{\s*([\s\S]*?)\s*\}\}/g
const FOR_OPEN = /\{%\s*for\s+(\w+)\s+in\s+site\.data\.(\w+)\s*%\}/
const CAPTURE = /\{%\s*capture\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endcapture\s*%\}/
const ASSIGN = /\{%\s*assign\s+(\w+)\s*=\s*([\s\S]*?)\s*%\}/
const IF_OPEN = /\{%\s*if\s+([\s\S]*?)\s*%\}/

/**
 * Offset of the `{% end… %}` that closes an already-consumed opening tag, relative to
 * `from`. Blocks of the same kind nested inside are counted, so a nested loop no longer
 * steals the outer one's `{% endfor %}`.
 */
function matchingClose(
  source: string,
  from: number,
  kind: 'for' | 'if',
  filePath: string,
): { index: number; length: number } {
  const re = new RegExp(`\\{%\\s*(end)?${kind}\\b[\\s\\S]*?%\\}`, 'g')
  re.lastIndex = from
  let depth = 1
  for (let m = re.exec(source); m; m = re.exec(source)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return { index: m.index - from, length: m[0].length }
  }
  throw new Error(`${filePath}: {% ${kind} %} without {% end${kind} %}`)
}

/**
 * `{% if %}` conditions, as cv.md writes them: `a == "x" or a == "y"`. Only `==` and `!=`
 * joined by `or`/`and` are supported; anything else throws.
 *
 * The operators fold right to left with no precedence between them, which is Liquid's rule
 * and not C's: `a and b or c` is `a and (b or c)`. cv.md uses only `or`, so the two readings
 * agree today — but silently disagreeing the first time an `and` is added is worse than
 * being right now.
 */
function evalCondition(cond: string, scope: Scope, filePath: string): boolean {
  const parts = cond.trim().split(/\s+(and|or)\s+/)
  let value = evalComparison(parts[parts.length - 1]!, scope, filePath)
  for (let i = parts.length - 2; i > 0; i -= 2) {
    const left = evalComparison(parts[i - 1]!, scope, filePath)
    value = parts[i] === 'and' ? left && value : left || value
  }
  return value
}

function evalComparison(cond: string, scope: Scope, filePath: string): boolean {
  const m = /^(.+?)\s*(==|!=)\s*"([^"]*)"$/.exec(cond.trim())
  if (!m) throw new Error(`${filePath}: unsupported Liquid condition "${cond}"`)
  const actual = resolve(m[1]!, scope, filePath)
  return m[2] === '==' ? actual === m[3] : actual !== m[3]
}

/**
 * Expands the Liquid subset these two files use, in document order.
 *
 * `scope` is mutated rather than copied, because `{% assign %}` is used as an accumulator
 * inside a `{% for %}` loop (cv.md counts its invited presentations that way) and a copied
 * scope would throw the running total away on every iteration.
 */
async function expand(
  source: string,
  ctx: Context,
  scope: Scope,
  filePath: string,
  render: Render,
): Promise<string> {
  // Blocks are handled in source order: taking `{% if %}` before an earlier `{% for %}`
  // would split the loop away from its `{% endfor %}`.
  const first = [
    ['for', FOR_OPEN.exec(source)],
    ['if', IF_OPEN.exec(source)],
    ['assign', ASSIGN.exec(source)],
    ['capture', CAPTURE.exec(source)],
  ]
    .filter((e): e is [string, RegExpExecArray] => e[1] !== null)
    .sort((a, b) => a[1].index - b[1].index)[0]
  if (!first) return expandLeaves(source, ctx, scope, filePath, render)
  const [kind, match] = first

  // `{% if cond %}…{% endif %}` — only inside the presentation-counting loop.
  if (kind === 'if') {
    const ifOpen = match
    const bodyStart = ifOpen.index + ifOpen[0].length
    const ifClose = matchingClose(source, bodyStart, 'if', filePath)
    const body = source.slice(bodyStart, bodyStart + ifClose.index)
    const before = await expand(source.slice(0, ifOpen.index), ctx, scope, filePath, render)
    const taken = evalCondition(ifOpen[1]!, scope, filePath)
      ? await expand(body, ctx, scope, filePath, render)
      : ''
    const after = await expand(
      source.slice(bodyStart + ifClose.index + ifClose.length),
      ctx,
      scope,
      filePath,
      render,
    )
    return before + taken + after
  }

  // `{% assign name = … %}` — a literal, or `name | plus: 1`.
  if (kind === 'assign') {
    const assign = match
    const before = await expand(source.slice(0, assign.index), ctx, scope, filePath, render)
    const expr = assign[2]!
    const plus = /^(.+?)\s*\|\s*plus:\s*(\d+)$/.exec(expr)
    scope[assign[1]!] = plus
      ? String(Number(resolve(plus[1]!, scope, filePath)) + Number(plus[2]))
      : /^-?\d+$/.test(expr)
        ? expr
        : resolve(expr, scope, filePath)
    const after = await expand(
      source.slice(assign.index + assign[0].length),
      ctx,
      scope,
      filePath,
      render,
    )
    return before + after
  }

  // `{% for x in site.data.name %}` — the student tables and the presentation counter.
  if (kind === 'for') {
    const open = match
    const bodyStart = open.index + open[0].length
    const close = matchingClose(source, bodyStart, 'for', filePath)
    const body = source.slice(bodyStart, bodyStart + close.index)
    const table = ctx.data[open[2]!]
    if (!table) throw new Error(`${filePath}: no _data/${open[2]}.yml`)

    // The prefix is expanded first so any {% assign %} before the loop is in scope.
    const before = await expand(source.slice(0, open.index), ctx, scope, filePath, render)
    const previous = scope[open[1]!]
    const parts: string[] = []
    for (const pair of Object.entries(table)) {
      scope[open[1]!] = pair
      parts.push(await expand(body, ctx, scope, filePath, render))
    }
    if (previous === undefined) delete scope[open[1]!]
    else scope[open[1]!] = previous
    return (
      before +
      parts.join('') +
      (await expand(
        source.slice(bodyStart + close.index + close.length),
        ctx,
        scope,
        filePath,
        render,
      ))
    )
  }

  // `{% capture name %}…{% endcapture %}`, in order, so later tags see the value.
  if (kind === 'capture') {
    const cap = match
    const before = await expandLeaves(source.slice(0, cap.index), ctx, scope, filePath, render)
    scope[cap[1]!] = (await expandLeaves(cap[2]!, ctx, scope, filePath, render)).trim()
    const after = await expand(
      source.slice(cap.index + cap[0].length),
      ctx,
      scope,
      filePath,
      render,
    )
    return before + after
  }

  return expandLeaves(source, ctx, scope, filePath, render)
}

/** Everything that is not a block: includes, bibliography tags and output expressions. */
async function expandLeaves(
  source: string,
  ctx: Context,
  scope: Scope,
  filePath: string,
  render: Render,
): Promise<string> {
  const out = await asyncReplace(source, TAG, async (_whole, body: string) => {
    const include = /^include\s+([\w.-]+)\s*([\s\S]*)$/.exec(body)
    if (include) {
      const name = include[1]!
      const params = parseParams(include[2]!, scope, filePath)
      if (name === 'cv-listing.html') return cvListing(params, render)
      if (name === 'book.html') return book(params)
      if (name === 'presentations.html') return presentations(params, ctx.presentations)
      throw new Error(`${filePath}: no port of {% include ${name} %}`)
    }

    const count = /^bibliography_count\s*(?:--query\s+([\s\S]+))?$/.exec(body)
    if (count) {
      const q = count[1]?.trim()
      return String(q ? queryEntries(ctx.entries, q).length : ctx.entries.length)
    }

    const bib = /^bibliography\s*(?:--query\s+([\s\S]+))?$/.exec(body)
    if (bib) {
      const q = bib[1]?.trim()
      return bibliography(q ? queryEntries(ctx.entries, q) : ctx.entries, ctx.knows)
    }

    throw new Error(`${filePath}: unsupported Liquid tag {% ${body} %}`)
  })

  return out.replace(OUTPUT, (_whole, expr: string) => {
    // `{{ site.data.studentsphd | size }}` — the two student counts.
    const size = /^site\.data\.(\w+)\s*\|\s*size$/.exec(expr.trim())
    if (size) {
      const table = ctx.data[size[1]!]
      if (!table) throw new Error(`${filePath}: no _data/${size[1]}.yml`)
      return String(Object.keys(table).length)
    }
    // `{{ lastauthorcountpartial | plus: 3 }}` — the last-author publication count.
    const plus = /^(.+?)\s*\|\s*plus:\s*(\d+)$/.exec(expr)
    if (plus) return String(Number(resolve(plus[1]!, scope, filePath)) + Number(plus[2]))
    return resolve(expr, scope, filePath)
  })
}

const loadData = (path: string) =>
  parseYaml(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>

export async function renderLiquid(
  source: string,
  filePath: string,
  render: Render,
): Promise<string> {
  const ctx: Context = {
    entries: loadBibliography(),
    knows: loadKnows(),
    presentations: loadPresentations(),
    data: {
      studentsphd: loadData('_data/studentsphd.yml'),
      studentsmaster: loadData('_data/studentsmaster.yml'),
      presentations: loadData('_data/presentations.yml'),
    },
  }

  const out = await expand(source, ctx, {}, filePath, render)
  if (out.includes('{%') || out.includes('{{')) {
    throw new Error(`${filePath}: Liquid syntax left after rendering`)
  }
  return out
}

/** Reads a Jekyll page, splits its front matter, and renders the Liquid in its body. */
export function loadLiquidPage(path: string, render: Render): Promise<string> {
  const contents = readFileSync(path, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(contents)
  if (!m) throw new Error(`${path} has no front matter`)
  return renderLiquid(contents.slice(m[0].length), path, render)
}

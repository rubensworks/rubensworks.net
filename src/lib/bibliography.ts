import * as bibtex from '@retorquere/bibtex-parser'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import { parseRawEntries, normaliseNames } from './bibtex-serialise'

export interface Author { first: string; last: string; display: string }
export interface Entry {
  key: string; type: string; title: string; year: number
  monthNumeric: number | null
  authors: Author[]
  /**
   * Normalised "Last, First and ..." built from the RAW author field — the string
   * `--query` matches, which is what makes `^= Taelman` mean "first author".
   */
  authorString: string
  booktitle?: string; journal?: string; abstract?: string; url?: string
  _type?: string; _slides?: string; _poster?: string; _video?: string
  _highlighted?: string
  /**
   * Values byte-for-byte as written. cv.md's `--query` filters match these, not the
   * rendered ones: `@*[_type=Master's Thesis]` has a straight apostrophe where the rendered
   * value has `Master’s Thesis`.
   */
  queryFields: Record<string, string>
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
/**
 * The month as a number, for the secondary sort key. Accepts both forms, because the parser
 * has usually already converted it: `month = {october}` arrives as `"10"`. Handling only
 * names returned null for 91 of 92 entries and silently collapsed the sort.
 */
export function monthToNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    return n >= 1 && n <= 12 ? n : null
  }
  const k = trimmed.toLowerCase().slice(0, 3)
  return MONTHS[k] ?? null
}

/**
 * `{first} {prefix} {last}`, spaces collapsed. The family name is taken verbatim, particles
 * included, so no von-particle heuristics: `Van de Vyvere, Brecht` -> `Brecht Van de Vyvere`.
 */
function toAuthor(c: { firstName?: string; lastName?: string; prefix?: string }): Author {
  const display = nfc([c.firstName, c.prefix, c.lastName]
    .filter(Boolean).join(' ').replace(/\s+/g, ' ').trim())
  return {
    first: nfc(c.firstName ?? ''),
    last: nfc([c.prefix, c.lastName].filter(Boolean).join(' ')),
    display,
  }
}

/**
 * The parser decodes LaTeX accents to DECOMPOSED (NFD) Unicode: `Gal{\'a}rraga` becomes
 * "Gala\u0301rraga". knows.yml is composed (NFC), so without this the two render identically
 * but compare unequal — the author lookup misses and the foaf:maker triples vanish.
 */
export const nfc = (s: string): string => s.normalize('NFC')

/**
 * The parser honours LaTeX's `%` line-comment rule, which silently truncates any value
 * containing a bare `%` — an abstract and a URL with `%20` in this file. Escaping first
 * keeps them whole; `\%` decodes back to a literal `%`.
 */
export const escapePercent = (s: string): string => s.replace(/(?<!\\)%/g, '\\%')

// Private-use code points: impossible in the bibliography, and passed through untouched.
const NL = '\uE000'
const TAB = '\uE001'
const SP = '\uE002'

/**
 * The parser collapses whitespace inside a value; titles and abstracts need it kept, because
 * a microdata literal is the element's exact text content and collapsing it changes the RDF
 * graph the page publishes. Runs the parser would rewrite (newline, tab, or 2+ spaces) are
 * encoded into private-use code points and decoded after. Single spaces are left alone so
 * LaTeX macro parsing still sees its separators.
 *
 * Name lists are skipped: the parser splits them on ` and `, so encoding the newline in a
 * wrapped `author` would leave `Taelman and<NL>Dimou`, merging two people into one and
 * losing a foaf:maker triple. They are reassembled from parsed parts anyway.
 */
const NAME_FIELDS = new Set([
  'author',
  'bookauthor',
  'commentator',
  'editor',
  'editora',
  'editorb',
  'editorc',
  'holder',
  'introduction',
  'shortauthor',
  'shorteditor',
  'translator',
])

export function protectWhitespace(source: string): string {
  let out = ''
  let depth = 0
  let field = ''
  let pending = ''
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!
    if (c === '\\') {
      out += c + (source[i + 1] ?? '')
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--

    // At depth 1 — the entry body — track which field the next value belongs to.
    if (depth === 1) {
      if (c === '=') {
        field = pending.trim().toLowerCase()
        pending = ''
      } else if (c === ',') {
        field = ''
        pending = ''
      } else {
        pending += c
      }
    }

    // depth >= 2 means "inside a field value" — depth 1 is the entry body itself.
    if (depth >= 2 && !NAME_FIELDS.has(field) && /[ \t\n]/.test(c)) {
      let j = i
      while (j < source.length && /[ \t\n]/.test(source[j]!)) j++
      const run = source.slice(i, j)
      // A run containing a newline or tab, or two or more spaces.
      if (/[\n\t]/.test(run) || run.length > 1) {
        out += run.replace(/\n/g, NL).replace(/\t/g, TAB).replace(/ /g, SP)
        i = j - 1
        continue
      }
    }
    out += c
  }
  return out
}

export const restoreWhitespace = (s: string): string =>
  s.split(NL).join('\n').split(TAB).join('\t').split(SP).join(' ')

/** Undoes escapePercent. Unconditional: a decoded value never legitimately holds `\%`. */
export const unescapePercent = (s: string): string => s.replace(/\\%/g, '%')

/**
 * LaTeX reads a plain `'` as a right single quote; the parser handles every other escape but
 * not this one. `Master's Thesis` in the .bib renders as `Master’s Thesis`.
 */
export const latexApostrophes = (s: string): string => s.replace(/'/g, '’')

/** The full decoded-value pipeline: NFC, latex apostrophes, and the `%` round-trip. */
const clean = (v: string): string =>
  restoreWhitespace(unescapePercent(latexApostrophes(nfc(v))))

let cache: Entry[] | null = null

/** Parses references.bib exactly ONCE per build. */
export function loadBibliography(path = '_bibliography/references.bib'): Entry[] {
  if (cache) return cache
  // sentenceCase MUST be off: it lowercases every booktitle and title ("...international
  // semantic web conference"). The casing in the .bib is the casing published.
  // verbatimFields: [] so `url` is decoded like every other field.
  const parsed = bibtex.parse(protectWhitespace(escapePercent(readFileSync(path, 'utf8'))), {
    sentenceCase: false,
    verbatimFields: [],
  })
  if (parsed.errors.length) throw new Error(`BibTeX parse errors: ${JSON.stringify(parsed.errors)}`)

  // The same file read a second way, for Entry.queryFields.
  const rawByKey = new Map(
    parseRawEntries(readFileSync(path, 'utf8')).map((e) => [
      e.key,
      Object.fromEntries(e.fields.map(([n, v]) => [n.toLowerCase(), v])),
    ]),
  )

  const entries: Entry[] = parsed.entries.map((e) => {
    const f = e.fields as Record<string, any>
    const raw = rawByKey.get(e.key)
    const authors: Author[] = (f.author ?? []).map(toAuthor)
    const str = (v: any) => (v == null ? undefined : clean(String(v)))
    return {
      key: e.key,
      type: e.type,
      title: str(f.title) ?? '',
      year: Number(f.year),
      monthNumeric: monthToNumber(str(f.month)),
      authors,
      authorString: raw?.author ? normaliseNames(raw.author) : '',
      booktitle: str(f.booktitle), journal: str(f.journal),
      abstract: str(f.abstract), url: str(f.url),
      _type: str(f._type), _slides: str(f._slides), _poster: str(f._poster),
      _video: str(f._video), _highlighted: str(f._highlighted),
      queryFields: raw ?? {},
    }
  })

  // Newest first, by year then month. An entry with no month sorts last within its year.
  entries.sort((a, b) =>
    (b.year - a.year) || ((b.monthNumeric ?? 0) - (a.monthNumeric ?? 0)))

  cache = entries
  return entries
}

export function groupByYear(entries: Entry[]): [number, Entry[]][] {
  const groups = new Map<number, Entry[]>()
  for (const e of entries) {
    if (!groups.has(e.year)) groups.set(e.year, [])
    groups.get(e.year)!.push(e)
  }
  return [...groups.entries()].sort((a, b) => b[0] - a[0]) // group_order: descending
}

/** `_data/knows.yml`: display name -> profile URL + FOAF identity. */
export type Knows = Record<string, { url: string; foaf: string }>

export function loadKnows(path = '_data/knows.yml'): Knows {
  return parseYaml(readFileSync(path, 'utf8'))
}

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
   * RAW field values, straight from the file. jekyll-scholar evaluates `--query` against
   * `bibliography[query]` (utilities.rb:174), i.e. the parsed bibliography *before*
   * `bibtex_filters` runs, so queries see undecoded text. cv.md depends on it:
   * `@*[_type=Master's Thesis]` is written with a straight apostrophe, while the rendered
   * value is `Master’s Thesis` with a typographic one.
   */
  queryFields: Record<string, string>
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
/**
 * bibtex-ruby's `:parse_months` accepts full names and 3-letter abbreviations, and yields
 * the `month_numeric` field the sort actually keys on.
 *
 * `@retorquere/bibtex-parser` has already done that conversion by the time we see the
 * field: `month = {october}` comes back as the string `"10"`, not `"october"`. Handling
 * only names here silently produced `null` for 91 of the 92 entries, which collapsed the
 * secondary sort key and left the publications page in file order within each year.
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
 * jekyll-scholar renders `{{first}} {{prefix}} {{last}}` then collapses "  " -> " ".
 * Verified against bibtex-ruby+namae for all 88 authors in references.bib: the result is
 * always `given + " " + verbatim family field`, so no von-particle heuristics are needed.
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
 * @retorquere/bibtex-parser decodes LaTeX accents to DECOMPOSED (NFD) Unicode --
 * `Gal{\'a}rraga` becomes "Gala\u0301rraga", not "Gal\u00e1rraga".
 * Ruby's latex-decode (and _data/knows.yml) use composed NFC. Without this the strings
 * render identically but compare unequal, silently breaking the knows.yml author lookup
 * and dropping the foaf:maker / schema:author RDFa triples. Normalise everything.
 */
export const nfc = (s: string): string => s.normalize('NFC')

/**
 * `@retorquere/bibtex-parser` honours LaTeX's `%` line-comment rule; bibtex-ruby does not.
 * Two fields in references.bib are affected and both truncate silently:
 *   - hanski_icwe_restart_2025's abstract loses everything after "reductions of up to 36"
 *   - taelman_eswc_poster_2016's url loses everything after ".../Accepted%"
 * Escaping unescaped `%` before parsing restores bibtex-ruby's reading; `\%` decodes back
 * to a literal `%`, and LaTeX accent handling is unaffected.
 */
export const escapePercent = (s: string): string => s.replace(/(?<!\\)%/g, '\\%')

// Private-use code points, chosen because they cannot occur in the bibliography and pass
// through the parser untouched.
const NL = '\uE000'
const TAB = '\uE001'
const SP = '\uE002'

/**
 * `@retorquere/bibtex-parser` collapses runs of whitespace inside a value to a single space
 * and trims the ends. jekyll-scholar parses with `strip: false` (defaults.rb:38) and keeps
 * them, so on the live site `<p class="abstract">` starts with a newline and ends with the
 * two spaces that preceded the closing brace, and `taelman_iswc_ostrich_2019`'s title stays
 * split across two lines.
 *
 * That is not cosmetic: the title carries `itemprop="name"` and the abstract
 * `property="schema:abstract"`, and microdata literals are the element's exact text content,
 * so collapsing the whitespace changes the published RDF graph. (RDFa normalises whitespace
 * in plain literals, which is why only the microdata half of the comparison caught the
 * title, and why the abstracts only showed up once the titles were fixed.)
 *
 * Every whitespace run that the parser would rewrite — one containing a newline or tab, or
 * two or more spaces — is encoded into private-use code points before parsing and decoded
 * afterwards. Single spaces are left alone so LaTeX macro parsing still sees the separators
 * it expects.
 *
 * Name lists are excluded. The parser splits `author` and friends on ` and `, and a name
 * list wrapped across lines puts that newline right next to the separator — encoding it
 * would leave `Taelman and<NL>Dimou`, which no longer matches, silently merging two people
 * into one and taking their foaf:maker triples with them. Nothing is lost by skipping them:
 * a name list is reassembled from its parsed parts, so its original spacing never reaches
 * the page.
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
      // Anything the parser would rewrite: a run containing a newline or tab, or two or
      // more spaces ("The  Web  is  evolving" in verbrugge_fitce_2021's abstract).
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

/**
 * Undoes `escapePercent` on the decoded side. LaTeX decoding turns `\%` back into `%` in
 * most fields, but not in every one the parser routes differently, so this runs
 * unconditionally: a decoded value has no legitimate reason to contain `\%`.
 */
export const unescapePercent = (s: string): string => s.replace(/\\%/g, '%')

/**
 * jekyll-scholar runs `bibtex_filters` — `[:smallcaps, :superscript, :italics, :latex]` —
 * over *every* field (utilities.rb:543), so the values that reach `bib.html` are
 * latex-decoded. `@retorquere/bibtex-parser` agrees with Ruby's latex-decode on `--`, `---`,
 * `~`, ``` `` ``` / `''`, `\%`, accents and `$…$`, but not on the plain apostrophe: LaTeX
 * treats `'` as a right single quote, so `Master's Thesis` renders as `Master’s Thesis` on
 * the live site.
 */
export const latexApostrophes = (s: string): string => s.replace(/'/g, '’')

/** The full decoded-value pipeline: NFC, latex apostrophes, and the `%` round-trip. */
const clean = (v: string): string =>
  restoreWhitespace(unescapePercent(latexApostrophes(nfc(v))))

let cache: Entry[] | null = null

/** Parses references.bib exactly ONCE per build. */
export function loadBibliography(path = '_bibliography/references.bib'): Entry[] {
  if (cache) return cache
  // sentenceCase MUST be off: it is Better-BibTeX behaviour that rewrites
  // "Proceedings of the 25th International Semantic Web Conference" to
  // "...international semantic web conference", changing every entry's booktitle/title.
  // Jekyll/jekyll-scholar never touches title casing.
  // verbatimFields: [] because jekyll-scholar applies bibtex_filters to every field,
  // including `url`, which the parser would otherwise pass through undecoded.
  const parsed = bibtex.parse(protectWhitespace(escapePercent(readFileSync(path, 'utf8'))), {
    sentenceCase: false,
    verbatimFields: [],
  })
  if (parsed.errors.length) throw new Error(`BibTeX parse errors: ${JSON.stringify(parsed.errors)}`)

  // The same file read a second way: values byte-for-byte as written, which is what the
  // query operators must match against.
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

  // _config.yml: sort_by: year,month  order: descending
  // sort_keys maps `month` -> `month_numeric` (jekyll-scholar utilities.rb:218).
  // Missing month sorts as an empty value => last within its year.
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

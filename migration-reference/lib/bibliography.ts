import * as bibtex from '@retorquere/bibtex-parser'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

export interface Author { first: string; last: string; display: string }
export interface Entry {
  key: string; type: string; title: string; year: number
  monthNumeric: number | null
  authors: Author[]
  authorString: string          // normalised "Last, First and ..." — what --query matches
  booktitle?: string; journal?: string; abstract?: string; url?: string
  _type?: string; _slides?: string; _poster?: string; _video?: string
  _highlighted?: string
  fields: Record<string, string>
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
/** bibtex-ruby's :parse_months accepts full names and 3-letter abbreviations. */
export function monthToNumber(raw: string | undefined): number | null {
  if (!raw) return null
  const k = raw.trim().toLowerCase().slice(0, 3)
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

let cache: Entry[] | null = null

/** Parses references.bib exactly ONCE per build. */
export function loadBibliography(path = '_bibliography/references.bib'): Entry[] {
  if (cache) return cache
  // sentenceCase MUST be off: it is Better-BibTeX behaviour that rewrites
  // "Proceedings of the 25th International Semantic Web Conference" to
  // "...international semantic web conference", changing every entry's booktitle/title.
  // Jekyll/jekyll-scholar never touches title casing.
  const parsed = bibtex.parse(readFileSync(path, 'utf8'), { sentenceCase: false })
  if (parsed.errors.length) throw new Error(`BibTeX parse errors: ${JSON.stringify(parsed.errors)}`)

  const entries: Entry[] = parsed.entries.map((e) => {
    const f = e.fields as Record<string, any>
    const authors: Author[] = (f.author ?? []).map(toAuthor)
    const str = (v: any) => (v == null ? undefined : nfc(String(v)))
    return {
      key: e.key,
      type: e.type,
      title: str(f.title) ?? '',
      year: Number(f.year),
      monthNumeric: monthToNumber(str(f.month)),
      authors,
      authorString: nfc((f.author ?? [])
        .map((c: any) => [[c.prefix, c.lastName].filter(Boolean).join(' '), c.firstName]
          .filter(Boolean).join(', ')).join(' and ')),
      booktitle: str(f.booktitle), journal: str(f.journal),
      abstract: str(f.abstract), url: str(f.url),
      _type: str(f._type), _slides: str(f._slides), _poster: str(f._poster),
      _video: str(f._video), _highlighted: str(f._highlighted),
      fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, nfc(String(v))])),
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

export function loadKnows(path = '_data/knows.yml'): Record<string, { url: string; foaf: string }> {
  return parseYaml(readFileSync(path, 'utf8'))
}

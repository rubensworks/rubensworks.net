import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  loadBibliography,
  groupByYear,
  monthToNumber,
  loadKnows,
  protectWhitespace,
  restoreWhitespace,
} from '../src/lib/bibliography'
import { matchOp, queryEntries, compileQuery } from '../src/lib/bibquery'

const entries = loadBibliography()

describe('parsing', () => {
  it('parses all 92 entries with no errors', () => {
    expect(entries).toHaveLength(92)
  })

  it('preserves the custom _-prefixed fields jekyll-scholar exposes', () => {
    // citation-js drops these (CSL-JSON normalisation) -- they drive cv.md and the homepage.
    const e = entries.find((x) => x.key === 'taelman_iswc_resources_comunica_2018')!
    expect(e._type).toBe('Conference')
    expect(e._highlighted).toBe('true')
    expect(entries.filter((x) => x._highlighted === 'true')).toHaveLength(3)
  })

  it('covers every _type value used by cv.md', () => {
    // Two views of the same field. cv.md's queries carry the straight apostrophe because
    // they run against the raw file; the rendered value has the typographic one because
    // latex-decode reads `'` as a right single quote.
    const rendered = new Set(entries.map((e) => e._type))
    const queryable = new Set(entries.map((e) => e.queryFields._type))
    for (const t of ['Journal', 'Conference', 'Workshop', 'Demo', 'Poster', 'Challenge',
                     'Tutorial', 'PhD Symposium', 'Blue Sky', 'Position Statement']) {
      expect(rendered, `_type ${t} must exist`).toContain(t)
      expect(queryable, `_type ${t} must be queryable`).toContain(t)
    }
    expect(rendered).toContain('Master’s Thesis')
    expect(queryable).toContain("Master's Thesis")
  })
})

describe('author display names', () => {
  // Ground truth extracted from bibtex-ruby 4.4.7 + namae, the exact stack jekyll-scholar uses.
  const cases: [string, string][] = [
    ['Van de Vyvere, Brecht',       'Brecht Van de Vyvere'],
    ['Mendes de Farias, Tarcisio',  'Tarcisio Mendes de Farias'],
    ['de Valk, Sjors',              'Sjors de Valk'],
    ['De Meester, Ben',             'Ben De Meester'],
    ['Van der Wee, Marlies',        'Marlies Van der Wee'],
    ['Van de Sompel, Herbert',      'Herbert Van de Sompel'],
  ]
  it.each(cases)('renders %s as %s', (_raw, display) => {
    const all = new Set(entries.flatMap((e) => e.authors.map((a) => a.display)))
    expect(all).toContain(display)
  })

  it('decodes LaTeX accent escapes', () => {
    const all = new Set(entries.flatMap((e) => e.authors.map((a) => a.display)))
    expect(all).toContain('Luis Galárraga')                      // Gal{\'a}rraga
    expect(all).toContain('Julián Andrés Rojas Meléndez')        // Juli\'{a}n Andr{\'e}s Mel{\'e}ndez
    for (const n of all) expect(n, `raw LaTeX leaked: ${n}`).not.toMatch(/[\\{}]/)
  })

  it('yields 88 distinct authors', () => {
    expect(new Set(entries.flatMap((e) => e.authors.map((a) => a.display))).size).toBe(88)
  })

  it('every author resolves in knows.yml or the known-unlinked allowlist', () => {
    const knows = loadKnows()
    const allowlist = new Set(JSON.parse(process.env.UNLINKED_AUTHORS ?? '[]'))
    const unresolved = [...new Set(entries.flatMap((e) => e.authors.map((a) => a.display)))]
      .filter((n) => !(n in knows) && !allowlist.has(n))
    // Snapshot so a name-parsing regression changes the list and fails the build.
    expect(unresolved.sort()).toMatchSnapshot()
  })
})

describe('sorting and grouping', () => {
  it('sorts year descending, then month descending', () => {
    for (let i = 1; i < entries.length; i++) {
      const a = entries[i - 1], b = entries[i]
      expect(a.year).toBeGreaterThanOrEqual(b.year)
      if (a.year === b.year) {
        expect(a.monthNumeric ?? 0).toBeGreaterThanOrEqual(b.monthNumeric ?? 0)
      }
    }
  })

  it('parses month names and abbreviations like bibtex-ruby :parse_months', () => {
    expect(monthToNumber('october')).toBe(10)
    expect(monthToNumber('oct')).toBe(10)
    expect(monthToNumber('sep')).toBe(9)
    expect(monthToNumber('June')).toBe(6)
    expect(monthToNumber(undefined)).toBeNull()
  })

  it('sorts the one month-less entry last within its year', () => {
    const e = entries.find((x) => x.key === 'dimou_ekaw_workshop_2016')!
    expect(e.monthNumeric).toBeNull()
    const sameYear = entries.filter((x) => x.year === e.year)
    expect(sameYear[sameYear.length - 1].key).toBe(e.key)
  })

  it('groups by year in descending order', () => {
    const groups = groupByYear(entries)
    const years = groups.map(([y]) => y)
    expect(years).toEqual([...years].sort((a, b) => b - a))
    expect(groups.reduce((n, [, es]) => n + es.length, 0)).toBe(92)
  })

  // Ground truth, not a self-snapshot: the order the Jekyll site actually published,
  // scraped from the 92 "More" links on _site_golden/publications/index.html. An earlier
  // self-referential snapshot hid a real bug — monthToNumber was returning null for 91 of
  // 92 entries, so the secondary sort key did nothing.
  it('matches the entry order published by the Jekyll site', () => {
    const golden: string[] = JSON.parse(readFileSync('test/fixtures/entry-order.json', 'utf8'))
    expect(entries.map((e) => e.key)).toEqual(golden)
  })
})

describe('query operators (bibtex-ruby elements.rb:195-232)', () => {
  it('= is exact string equality', () => {
    expect(matchOp('Journal', '=', 'Journal')).toBe(true)
    expect(matchOp('Journal', '=', 'Journ')).toBe(false)
    expect(matchOp(undefined, '=', 'Journal')).toBe(false)
  })
  it('^= anchors a regex at the start', () => {
    expect(matchOp('Taelman, Ruben', '^=', 'Taelman')).toBe(true)
    expect(matchOp('Crum, Elias and Taelman, Ruben', '^=', 'Taelman')).toBe(false)
  })
  it('~= is an unanchored regex search', () => {
    expect(matchOp('Crum, Elias and Taelman, Ruben', '~=', 'Ruben$')).toBe(true)
    expect(matchOp('Taelman, Ruben and Crum, Elias', '~=', 'Ruben$')).toBe(false)
  })
  it('!~ is true when absent or not matching', () => {
    expect(matchOp(undefined, '!~', 'Verborgh')).toBe(true)
    expect(matchOp('Taelman, Ruben', '!~', 'Verborgh')).toBe(true)
    expect(matchOp('Verborgh, Ruben', '!~', 'Verborgh')).toBe(false)
  })
  it('!= is true when absent or different', () => {
    expect(matchOp(undefined, '!=', 'Journal')).toBe(true)
    expect(matchOp('Demo', '!=', 'Journal')).toBe(true)
    expect(matchOp('Journal', '!=', 'Journal')).toBe(false)
  })

  it('reproduces every --query used in the site', () => {
    const counts = Object.fromEntries([
      '@*[_highlighted=true]',
      '@*[_type=Journal]', '@*[_type=Conference]', '@*[_type=Workshop]',
      '@*[_type=Demo]', '@*[_type=Poster]', '@*[_type=Challenge]',
      '@*[_type=Tutorial]', '@*[_type=PhD Symposium]', '@*[_type=Blue Sky]',
      '@*[_type=Position Statement]', "@*[_type=Master's Thesis]",
      '@*[author ^= Taelman]',
      '@*[author ~= Ruben$ && author !~ Verborgh]',
      '@*[author !~ Verborgh]',
      '@*',
    ].map((q) => [q, queryEntries(entries, q).length]))
    // Expected values are the {% bibliography_count %} numbers rendered on the golden
    // /cv/ page, so this asserts against the live site rather than against ourselves.
    const golden = JSON.parse(readFileSync('test/fixtures/query-counts.json', 'utf8'))
    expect(counts).toEqual(golden)
  })

  it('^= on author means first author', () => {
    for (const e of queryEntries(entries, '@*[author ^= Taelman]')) {
      expect(e.authors[0].display).toMatch(/Taelman/)
    }
  })
  it('~= Ruben$ on author means last author is named Ruben', () => {
    for (const e of queryEntries(entries, '@*[author ~= Ruben$]')) {
      expect(e.authors[e.authors.length - 1].display).toMatch(/Ruben/)
    }
  })
  it('rejects query syntax it does not implement', () => {
    expect(() => compileQuery('@article[year>2020]')).toThrow()
  })
  it('reads a two-character operator written without spaces', () => {
    // A greedy `\S+` for the field name eats the `^`, leaving a plain `=` that matches
    // nothing — the query silently returns an empty bibliography instead of failing.
    const spaced = queryEntries(entries, '@*[author ^= Taelman]')
    expect(queryEntries(entries, '@*[author^=Taelman]')).toEqual(spaced)
    expect(spaced.length).toBeGreaterThan(0)
    expect(queryEntries(entries, '@*[author!~Taelman]')).toEqual(
      queryEntries(entries, '@*[author !~ Taelman]'),
    )
  })
})

describe('title casing (regression: @retorquere sentenceCase defaults to ON)', () => {
  it('preserves the verbatim title case from the .bib', () => {
    const e = entries.find((x) => x.key === 'crum_iswc_inuse_realworldfed_2026')!
    expect(e.booktitle).toBe('Proceedings of the 25th International Semantic Web Conference')
    const t = entries.find((x) => x.key === 'desmet_traqula_eswc_2026')!
    expect(t.title).toBe('Traqula: Providing a Foundation for The Evolving SPARQL Ecosystem Through Modular Query Parsing, Transformation, and Generation')
  })
  it('never lowercases a known acronym in any booktitle or journal', () => {
    for (const e of entries) {
      for (const f of [e.booktitle, e.journal].filter(Boolean) as string[]) {
        expect(f, `${e.key}: ${f}`).not.toMatch(/\b(semantic web conference|international conference|web conference)\b/)
      }
    }
  })
})

describe('whitespace protection', () => {
  // The parser collapses whitespace inside a value; jekyll-scholar keeps it, and microdata
  // literals are exact text content, so the raw runs have to survive the round trip.
  it('encodes runs the parser would rewrite, and decodes them back', () => {
    const protectedSrc = protectWhitespace('@article{x,\n  title = {A\n  wrapped  title},\n}')
    expect(protectedSrc).not.toContain('A\n  wrapped')
    expect(restoreWhitespace(protectedSrc)).toBe('@article{x,\n  title = {A\n  wrapped  title},\n}')
  })

  it('leaves name lists alone so " and " still separates them', () => {
    // Encoding the newline after `and` would leave `Taelman and<NL>Dimou`, which the
    // parser's ` and ` split no longer matches: two people silently become one, and the
    // second one's foaf:maker triple disappears from every page that cites the entry.
    const src = '@article{x,\n  author = {Taelman, Ruben and\n            Dimou, Anastasia},\n}'
    expect(protectWhitespace(src)).toBe(src)
  })

  it('still protects the field after a name list', () => {
    const out = protectWhitespace('@article{x,\n  author = {A, B},\n  title = {A\n  b},\n}')
    expect(out).not.toContain('A\n  b')
  })

  it('parses multi-line author fields in the real bibliography into separate people', () => {
    for (const e of entries) {
      for (const a of e.authors) {
        expect(a.display, `${e.key}: names ran together`).not.toMatch(/\band\b/)
      }
    }
  })
})

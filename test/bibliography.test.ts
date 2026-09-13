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


// Keys frozen when the fixtures below were recorded. Entries added since are not in it, so
// nothing here fails just because the bibliography grew.
const frozenKeys: string[] = JSON.parse(readFileSync('test/fixtures/entry-order.json', 'utf8'))
const frozen = new Set(frozenKeys)

describe('parsing', () => {
  it('parses every entry in the file, with no errors', () => {
    // Against the raw scanner rather than a hard-coded number: the two read the file in
    // completely different ways, so agreeing on the count is a real check and adding an
    // entry does not break it.
    const atSigns = readFileSync('_bibliography/references.bib', 'utf8').match(/^@\w+\{/gm)!
    expect(entries).toHaveLength(atSigns.length)
    expect(entries.length).toBeGreaterThanOrEqual(frozen.size)
  })

  it('normalises the doi field to a bare lower-case identifier', () => {
    // Written as a doi.org URL in the file; matched against dblp, which upper-cases DOIs.
    expect(entries.find((x) => x.key === 'crum_genomesharing_computersbiomed_2025')!.doi).toBe(
      '10.1016/j.compbiomed.2025.111335',
    )
    expect(entries.find((x) => x.key === 'taelman_iswc_resources_comunica_2018')!.doi).toBe(
      '10.1007/978-3-030-00668-6_15',
    )
    expect(entries.find((x) => x.key === 'taelman_mastersthesis')!.doi).toBeUndefined()
  })

  it('preserves the custom _-prefixed fields', () => {
    // A CSL-JSON based parser would drop these; they drive cv.md and the homepage.
    const e = entries.find((x) => x.key === 'taelman_iswc_resources_comunica_2018')!
    expect(e._type).toBe('Conference')
    expect(e._highlighted).toBe('true')
    // The homepage lists whichever entries carry it; the count is content, not a contract.
    expect(entries.filter((x) => x._highlighted === 'true').length).toBeGreaterThan(0)
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
  // Names whose particles make the given/family split ambiguous.
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

  it('gives every entry at least one non-empty author', () => {
    for (const e of entries) {
      expect(e.authors.length, `${e.key} has no authors`).toBeGreaterThan(0)
      for (const a of e.authors) expect(a.display.trim(), e.key).not.toBe('')
    }
  })

  // Checked in this direction on purpose. Asserting that every *author* is in knows.yml
  // would fail the moment a paper gains an external co-author with no profile, which is
  // ordinary. Asserting that every knows.yml *name* still matches an author catches the
  // thing that actually matters: a name-parsing change that silently stops the lookup
  // working and drops the foaf:maker links.
  it('every name in knows.yml still matches an author', () => {
    const authors = new Set(entries.flatMap((e) => e.authors.map((a) => a.display)))
    const unmatched = Object.keys(loadKnows()).filter((n) => !authors.has(n))
    expect(unmatched, 'knows.yml entries that link nothing').toEqual([])
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

  it('sorts month-less entries last within their year', () => {
    for (const year of new Set(entries.map((e) => e.year))) {
      const inYear = entries.filter((e) => e.year === year)
      const firstMonthless = inYear.findIndex((e) => e.monthNumeric === null)
      if (firstMonthless < 0) continue
      for (const e of inYear.slice(firstMonthless)) {
        expect(e.monthNumeric, `${e.key} has a month but sorts after one that does not`).toBeNull()
      }
    }
  })

  it('groups by year in descending order', () => {
    const groups = groupByYear(entries)
    const years = groups.map(([y]) => y)
    expect(years).toEqual([...years].sort((a, b) => b - a))
    expect(groups.reduce((n, [, es]) => n + es.length, 0)).toBe(entries.length)
  })

  // Recorded reference values, NOT a snapshot of this code's own output — do not regenerate
  // them from the sort above, or the test becomes vacuous. An earlier self-referential
  // snapshot hid a real bug: monthToNumber returned null for 91 of 92 entries, so the
  // secondary sort key did nothing and nothing complained.
  //
  // Compared as a *relative* order, so adding or removing an entry does not fail it.
  it('keeps the recorded entries in their recorded order', () => {
    const stillPresent = frozenKeys.filter((k) => entries.some((e) => e.key === k))
    expect(entries.map((e) => e.key).filter((k) => frozen.has(k))).toEqual(stillPresent)
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
    const recorded = entries.filter((e) => frozen.has(e.key))
    expect(recorded, 'a recorded entry was removed; re-record the fixtures')
      .toHaveLength(frozen.size)
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
    ].map((q) => [q, queryEntries(recorded, q).length]))
    // Recorded reference values, not a snapshot of what queryEntries currently returns.
    // Evaluated over the frozen entry set so that adding a publication — which legitimately
    // changes what /cv/ prints — does not fail this.
    const expected = JSON.parse(readFileSync('test/fixtures/query-counts.json', 'utf8'))
    expect(counts).toEqual(expected)
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
  // The parser collapses whitespace inside a value, and a microdata literal is the
  // element's exact text content, so the raw runs have to survive the round trip.
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

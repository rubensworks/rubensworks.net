import { describe, it, expect } from 'vitest'
import { loadBibliography, groupByYear, monthToNumber, loadKnows } from '../src/lib/bibliography'
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
    const types = new Set(entries.map((e) => e._type))
    for (const t of ['Journal', 'Conference', 'Workshop', 'Demo', 'Poster', 'Challenge',
                     'Tutorial', 'PhD Symposium', 'Blue Sky', 'Position Statement',
                     "Master's Thesis"]) {
      expect(types, `_type ${t} must exist`).toContain(t)
    }
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

  it('commits the full entry order as a fixture', () => {
    expect(entries.map((e) => e.key)).toMatchSnapshot()
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
    expect(counts).toMatchSnapshot()   // compare against golden bibliography_count output
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

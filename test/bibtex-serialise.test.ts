import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  parseRawEntries,
  serialiseEntry,
  monthSymbol,
  normaliseNames,
  loadBibtexBlocks,
} from '../src/lib/bibtex-serialise'
import { site } from '../src/site.config'

// The 92 golden <pre class="bibtex content"> blocks, extracted from the Jekyll baseline by
// verify/extract-bibtex-fixtures.mjs. This is the fixture set plan §9 calls for: it pins the
// one piece of jekyll-scholar that was never reproduced before.
const golden: Record<string, string> = JSON.parse(
  readFileSync('test/fixtures/bibtex-blocks.json', 'utf8'),
)

const skip = site.scholar.bibtexSkipFields

describe('raw BibTeX parsing', () => {
  const raw = parseRawEntries(readFileSync('_bibliography/references.bib', 'utf8'))

  it('finds all 92 entries', () => {
    expect(raw).toHaveLength(92)
  })

  it('keeps values undecoded, braces and LaTeX escapes intact', () => {
    const e = raw.find((x) => x.key === 'andresrojas_www_2018')!
    const author = e.fields.find(([n]) => n === 'author')![1]
    expect(author).toContain("Mel{\\'e}ndez")
    expect(author).toContain("Juli\\'{a}n Andr{\\'e}s")
  })

  it('keeps inner braces that mark protected casing', () => {
    const e = raw.find((x) => x.key === 'debackere_consent_2022')!
    expect(e.fields.find(([n]) => n === 'title')![1]).toContain('{Solid}')
  })

  it('preserves field order as written in the file', () => {
    const e = raw.find((x) => x.key === 'taelman_iswc_resources_comunica_2018')!
    expect(e.fields.map(([n]) => n).slice(0, 5)).toEqual([
      'author', 'title', 'booktitle', 'year', 'month',
    ])
  })
})

describe('monthSymbol', () => {
  it('matches bibtex-ruby parse_months on the first three letters', () => {
    expect(monthSymbol('october')).toBe('oct')
    expect(monthSymbol('oct')).toBe('oct')
    expect(monthSymbol('June')).toBe('jun')
    // The file really does contain this typo; bibtex-ruby still resolves it.
    expect(monthSymbol('februari')).toBe('feb')
  })

  it('returns null for values that are not months', () => {
    expect(monthSymbol('sometime')).toBeNull()
    expect(monthSymbol('')).toBeNull()
  })
})

describe('normaliseNames — BibTeX::Names#to_s', () => {
  it('leaves an already normalised list alone', () => {
    expect(normaliseNames('Taelman, Ruben and Verborgh, Ruben')).toBe(
      'Taelman, Ruben and Verborgh, Ruben',
    )
  })

  it('reorders the "First Last" form', () => {
    expect(normaliseNames('Ruben Taelman and Simon Steyskal and Sabrina Kirrane')).toBe(
      'Taelman, Ruben and Steyskal, Simon and Kirrane, Sabrina',
    )
  })

  it('discards a stray trailing comma inside a name', () => {
    expect(normaliseNames('Emonet, Vincent, and Antonatos, Haris')).toBe(
      'Emonet, Vincent and Antonatos, Haris',
    )
  })

  it('keeps LaTeX escapes and protective braces untouched', () => {
    expect(normaliseNames("Rojas Mel{\\'e}ndez, Juli\\'{a}n Andr{\\'e}s")).toBe(
      "Rojas Mel{\\'e}ndez, Juli\\'{a}n Andr{\\'e}s",
    )
  })

  // Expectations below are the literal output of bibtex-ruby 4.4.7 on Ruby 2.7, not a
  // reading of the BibTeX spec. Note `Brecht Van de Vyvere` -> `de Vyvere, Brecht Van`:
  // written without a comma, the capitalised `Van` lands in the *given* name. No entry in
  // references.bib is written that way, but pinning it keeps the heuristic honest.
  it('splits the family name at the first lowercase-initial word', () => {
    expect(normaliseNames('Sjors de Valk')).toBe('de Valk, Sjors')
    expect(normaliseNames('Brecht Van de Vyvere')).toBe('de Vyvere, Brecht Van')
    expect(normaliseNames('Tarcisio Mendes de Farias')).toBe('de Farias, Tarcisio Mendes')
  })

  it('passes a fully braced corporate name through untouched', () => {
    expect(normaliseNames('{Ghent University and imec}')).toBe('{Ghent University and imec}')
  })
})

describe('serialiseEntry', () => {
  it('indents continuation lines by two spaces, as bibtex-ruby does under strip:false', () => {
    // Exact expectations taken from running bibtex-ruby 4.4.7 on Ruby 2.7.
    const out = serialiseEntry(
      {
        type: 'article',
        key: 'a',
        fields: [
          ['title', 'Line one\n    four spaces before this'],
          ['note', 'Line one\n\ttab before'],
          ['other', 'Line one\nno indent'],
        ],
      },
      [],
    )
    expect(out).toBe(
      '@article{a,\n' +
        '  title = {Line one\n      four spaces before this},\n' +
        '  note = {Line one\n  \ttab before},\n' +
        '  other = {Line one\n  no indent}\n' +
        '}\n',
    )
  })

  it('emits a parsed month as a bare symbol, without braces', () => {
    const out = serialiseEntry(
      { type: 'article', key: 'a', fields: [['month', 'october']] },
      [],
    )
    expect(out).toBe('@article{a,\n  month = oct\n}\n')
  })

  it('keeps an unrecognised month braced', () => {
    const out = serialiseEntry(
      { type: 'article', key: 'a', fields: [['month', 'sometime']] },
      [],
    )
    expect(out).toBe('@article{a,\n  month = {sometime}\n}\n')
  })

  it('drops every bibtex_skip_fields entry', () => {
    const out = serialiseEntry(
      {
        type: 'article',
        key: 'a',
        fields: [['title', 'T'], ['abstract', 'A'], ['_type', 'Journal'], ['_highlighted', 'true']],
      },
      skip,
    )
    expect(out).toBe('@article{a,\n  title = {T}\n}\n')
  })
})

describe('the 92 golden <pre class="bibtex"> blocks', () => {
  const blocks = loadBibtexBlocks(skip)

  it('covers every entry on the golden site', () => {
    expect(Object.keys(golden)).toHaveLength(92)
    expect(blocks.size).toBe(92)
    expect(new Set(blocks.keys())).toEqual(new Set(Object.keys(golden)))
  })

  it.each(Object.keys(golden))('matches jekyll-scholar byte-for-byte: %s', (key) => {
    expect(blocks.get(key)).toBe(golden[key])
  })
})

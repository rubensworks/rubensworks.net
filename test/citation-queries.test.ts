import { describe, expect, it } from 'vitest'
import {
  CITATIONS_TTL_MS,
  MY_DBLP,
  citationsQuery,
  citingQuery,
  cleanTitle,
  findRecord,
  foldCitations,
  foldCiting,
  isDblpRecord,
  normaliseDoi,
  normaliseTitle,
  shortDoi,
  type Row,
} from '../src/scripts/citation-queries'

const lit = (value: string) => ({ value, termType: 'Literal' })
const iri = (value: string) => ({ value, termType: 'NamedNode' })

const comunica: Row = {
  publ: iri('https://dblp.org/rec/conf/semweb/TaelmanHSV18'),
  title: lit('Comunica: A Modular SPARQL Query Engine for the Web.'),
  year: lit('2018'),
  venue: lit('ISWC (2)'),
  pages: lit('239-255'),
  doi: iri('https://doi.org/10.1007/978-3-030-00668-6_15'),
  omid: iri('https://w3id.org/oc/meta/br/061602192183'),
  creators: lit('4'),
  cites: lit('55'),
}

describe('citationsQuery', () => {
  it('matches on my dblp identifier, never on a label', () => {
    const q = citationsQuery()
    expect(q).toContain(`dblp:authoredBy <${MY_DBLP}>`)
    expect(q).not.toContain('rdfs:label')
    expect(q).toContain('COUNT(DISTINCT ?citation)')
    expect(q).toContain('cito:hasCitedEntity')
  })

  it('keeps records without an OpenCitations id, since the count is optional', () => {
    expect(citationsQuery()).toMatch(/OPTIONAL \{ \?publ dblp:omid \?omid \.\s+OPTIONAL \{ \?citation cito:hasCitedEntity \?omid \} \}/)
  })
})

describe('citingQuery', () => {
  it('interpolates the record and ranks by the citing papers\' own citations', () => {
    const q = citingQuery('https://dblp.org/rec/conf/semweb/TaelmanHSV18')
    expect(q).toContain('<https://dblp.org/rec/conf/semweb/TaelmanHSV18> dblp:omid ?omid')
    expect(q).toContain('ORDER BY DESC(?cites) LIMIT 3')
  })

  // The record IRI comes from a query result, so it is checked before it goes into a query.
  it('refuses anything that is not a dblp record IRI', () => {
    expect(() => citingQuery('https://dblp.org/rec/x> } . ?s ?p ?o . { <')).toThrow()
    expect(() => citingQuery('https://example.org/rec/abc')).toThrow()
    expect(isDblpRecord('https://dblp.org/rec/journals/ws/TaelmanSHMV19')).toBe(true)
    expect(isDblpRecord('https://dblp.org/rec/a b')).toBe(false)
  })
})

describe('foldCitations', () => {
  it('reads one record with its count', () => {
    expect(foldCitations([comunica])).toEqual([
      {
        record: 'https://dblp.org/rec/conf/semweb/TaelmanHSV18',
        title: 'Comunica: A Modular SPARQL Query Engine for the Web',
        year: '2018',
        venue: 'ISWC (2)',
        pages: '239-255',
        doi: 'https://doi.org/10.1007/978-3-030-00668-6_15',
        omid: 'https://w3id.org/oc/meta/br/061602192183',
        creators: '4',
        cites: 55,
      },
    ])
  })

  // Absence from the index is not zero citations, so the count is simply not there.
  it('leaves the count undefined when the record has no OpenCitations id', () => {
    const row: Row = { ...comunica, omid: undefined, cites: lit('0') }
    expect(foldCitations([row])[0]!.cites).toBeUndefined()
  })

  it('keeps a zero for a record that is in the index', () => {
    const row: Row = { ...comunica, cites: lit('0') }
    expect(foldCitations([row])[0]!.cites).toBe(0)
  })

  it('collapses repeated rows of one record and drops rows without a record or title', () => {
    const twice = foldCitations([comunica, { ...comunica, doi: iri('https://doi.org/10.1000/other') }])
    expect(twice).toHaveLength(1)
    expect(foldCitations([{ ...comunica, publ: undefined }, { ...comunica, title: lit('  ') }])).toEqual([])
  })

  it('ignores a record whose IRI is not on dblp', () => {
    expect(foldCitations([{ ...comunica, publ: iri('https://evil.example/rec/x') }])).toEqual([])
  })
})

describe('foldCiting', () => {
  const paper = (record: string, cites: string): Row => ({
    citing: iri(record),
    title: lit('Some title.'),
    year: lit('2021'),
    cites: lit(cites),
  })

  it('ranks by citations, one entry per record, at most the limit', () => {
    const out = foldCiting([
      paper('https://dblp.org/rec/a/1', '2'),
      paper('https://dblp.org/rec/a/2', '20'),
      paper('https://dblp.org/rec/a/2', '20'),
      paper('https://dblp.org/rec/a/3', '7'),
      paper('https://dblp.org/rec/a/4', '9'),
    ])
    expect(out.map((p) => [p.record, p.cites])).toEqual([
      ['https://dblp.org/rec/a/2', 20],
      ['https://dblp.org/rec/a/4', 9],
      ['https://dblp.org/rec/a/3', 7],
    ])
    expect(out[0]!.title).toBe('Some title')
  })
})

describe('title matching', () => {
  it('ignores case, punctuation and the trailing full stop dblp adds', () => {
    expect(normaliseTitle('Comunica: a Modular SPARQL Query Engine for the Web')).toBe(
      normaliseTitle('Comunica: A Modular SPARQL Query Engine for the Web.'),
    )
    expect(normaliseTitle('Exposing RDF Archives using Triple Pattern Fragments')).toBe(
      normaliseTitle('Exposing rdf Archives Using Triple Pattern Fragments.'),
    )
    expect(cleanTitle('Title.  ')).toBe('Title')
  })

  it('finds the record for a page title and nothing for an unknown one', () => {
    const records = foldCitations([comunica])
    expect(findRecord(records, 'Comunica: a Modular SPARQL Query Engine for the Web')?.cites).toBe(55)
    expect(findRecord(records, 'Something else entirely')).toBeUndefined()
    expect(findRecord(records, '')).toBeUndefined()
  })

  // The journal version of a paper often carries the workshop paper's title; the DOI does not.
  it('prefers the DOI over the title when the entry has one', () => {
    const journal: Row = { ...comunica, publ: iri('https://dblp.org/rec/journals/x/Y24'), doi: iri('https://doi.org/10.1000/journal'), cites: lit('3') }
    const records = foldCitations([comunica, journal])
    expect(findRecord(records, 'Comunica: a Modular SPARQL Query Engine for the Web', '10.1000/JOURNAL')?.cites).toBe(3)
    expect(findRecord(records, 'Comunica: a Modular SPARQL Query Engine for the Web', 'https://doi.org/10.1000/journal')?.cites).toBe(3)
  })

  it('falls back to the title when the DOI matches nothing', () => {
    const records = foldCitations([comunica])
    expect(findRecord(records, 'Comunica: a Modular SPARQL Query Engine for the Web', '10.1000/elsewhere')?.cites).toBe(55)
  })
})

describe('normaliseDoi', () => {
  it('reduces every written form to one bare lower-case identifier', () => {
    expect(normaliseDoi('10.7717/PEERJ-CS.387')).toBe('10.7717/peerj-cs.387')
    expect(normaliseDoi('https://doi.org/10.7717/peerj-cs.387')).toBe('10.7717/peerj-cs.387')
    expect(normaliseDoi('http://dx.doi.org/10.7717/peerj-cs.387')).toBe('10.7717/peerj-cs.387')
    expect(normaliseDoi('doi:10.7717/peerj-cs.387')).toBe('10.7717/peerj-cs.387')
  })

  it('rejects anything that is not a DOI', () => {
    expect(normaliseDoi('https://example.org/paper')).toBeUndefined()
    expect(normaliseDoi('')).toBeUndefined()
    expect(normaliseDoi(undefined)).toBeUndefined()
  })
})

describe('shortDoi', () => {
  it('shortens the doi.org forms and leaves anything else alone', () => {
    expect(shortDoi('https://doi.org/10.1/abc')).toBe('doi:10.1/abc')
    expect(shortDoi('http://dx.doi.org/10.1/abc')).toBe('doi:10.1/abc')
    expect(shortDoi('10.1/abc')).toBe('10.1/abc')
  })
})

it('caches the all-records result for a week', () => {
  expect(CITATIONS_TTL_MS).toBe(7 * 24 * 3600 * 1000)
})

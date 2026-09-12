import { describe, expect, it } from 'vitest'
import {
  dblpQuery,
  displayNameFor,
  foldFacts,
  hasSubstance,
  isDblpPerson,
  profileQuery,
  sparqlString,
  thumbnail,
  wikidataQuery,
  type RawFact,
} from '../src/scripts/foaf-queries'

const literal = (k: string, v: string, language?: string): RawFact => ({ k, v, termType: 'Literal', language })
const iri = (k: string, v: string): RawFact => ({ k, v, termType: 'NamedNode' })

describe('foldFacts', () => {
  it('keeps one value per field', () => {
    expect(foldFacts([literal('name', 'Ruben Verborgh'), literal('title', 'Professor')])).toEqual({
      name: 'Ruben Verborgh',
      title: 'Professor',
    })
  })

  // ruben.verborgh.org publishes every name twice, @en and @nl. Without a preference the
  // rendered language would depend on which binding happened to arrive first.
  it('prefers English over other languages', () => {
    const facts = foldFacts([literal('title', 'prof. dr. ir.', 'nl'), literal('title', 'Professor', 'en')])
    expect(facts.title).toBe('Professor')
  })

  it('prefers a plain literal over a non-English one', () => {
    expect(foldFacts([literal('name', 'Jan', 'nl'), literal('name', 'John')]).name).toBe('John')
  })

  it('prefers the shorter value among equals', () => {
    const facts = foldFacts([literal('title', 'Professor of a Great Many Things'), literal('title', 'Professor')])
    expect(facts.title).toBe('Professor')
  })

  // schema:worksFor is a node on some profiles, and its IRI is not an organisation name.
  it('drops IRIs from text fields and literals from IRI fields', () => {
    const facts = foldFacts([
      iri('org', 'https://example.org/org#id'),
      literal('image', '/not/an/iri.png'),
      iri('image', 'https://example.org/me.jpg'),
    ])
    expect(facts.org).toBeUndefined()
    expect(facts.image).toBe('https://example.org/me.jpg')
  })

  it('ignores blank values', () => {
    expect(foldFacts([literal('name', '   ')])).toEqual({})
  })
})

describe('displayNameFor', () => {
  it('uses foaf:name when there is one', () => {
    expect(displayNameFor({ name: 'Pieter Heyvaert', given: 'Pieter' }, 'P. Heyvaert')).toBe('Pieter Heyvaert')
  })

  // Femke Ongenae's profile carries the parts but no foaf:name.
  it('assembles the name from its parts', () => {
    expect(displayNameFor({ given: 'Femke', family: 'Ongenae' }, 'F. Ongenae')).toBe('Femke Ongenae')
  })

  it('falls back to the name printed on the page', () => {
    expect(displayNameFor({}, 'Katja Hose')).toBe('Katja Hose')
  })
})

describe('hasSubstance', () => {
  it('is false when the lookup only confirms the printed name', () => {
    expect(hasSubstance({ name: 'Katja Hose' }, 'Katja Hose')).toBe(false)
    expect(hasSubstance({}, 'Katja Hose')).toBe(false)
  })

  it('is true as soon as there is something new to show', () => {
    expect(hasSubstance({ title: 'Professor' }, 'Katja Hose')).toBe(true)
    expect(hasSubstance({ image: 'https://example.org/k.jpg' }, 'Katja Hose')).toBe(true)
    expect(hasSubstance({ description: 'computer scientist' }, 'Katja Hose')).toBe(true)
  })
})

describe('isDblpPerson', () => {
  it('recognises dblp person entities', () => {
    expect(isDblpPerson('https://dblp.org/pid/54/4551')).toBe(true)
    expect(isDblpPerson('https://dblp.org/pid/p/APoulovassilis')).toBe(true)
  })

  it('rejects the HTML page and other hosts', () => {
    expect(isDblpPerson('https://dblp.org/pid/286/5572.html')).toBe(false)
    expect(isDblpPerson('https://ruben.verborgh.org/profile/#me')).toBe(false)
  })
})

describe('query construction', () => {
  it('interpolates the person as a concrete subject', () => {
    const query = profileQuery('https://ruben.verborgh.org/profile/#me')
    expect(query).toContain('<https://ruben.verborgh.org/profile/#me> foaf:name')
    expect(query).not.toContain('?person')
  })

  // Stacked OPTIONALs multiply: four foaf:homepage values would return four rows for every
  // other field. Each fact has to come back on its own row.
  it('uses UNION rather than OPTIONAL', () => {
    expect(profileQuery('https://example.org/#me')).not.toContain('OPTIONAL')
    expect(profileQuery('https://example.org/#me')).toContain('UNION')
  })

  it('matches dblp on the entity when one is known', () => {
    expect(dblpQuery('https://dblp.org/pid/54/4551', 'Adriane Chapman')).toContain(
      'BIND(<https://dblp.org/pid/54/4551> AS ?a)',
    )
  })

  it('matches dblp on the printed name otherwise', () => {
    const query = dblpQuery('https://ruben.verborgh.org/profile/#me', 'Ruben Verborgh')
    expect(query).toContain('?a rdfs:label "Ruben Verborgh"')
  })

  it('escapes names that would break the literal', () => {
    expect(sparqlString('A "quoted" \\ name')).toBe('"A \\"quoted\\" \\\\ name"')
    expect(dblpQuery('https://example.org/#me', 'Ann "X" Doe')).toContain('"Ann \\"X\\" Doe"')
  })

  it('asks Wikidata only about the entity it was given', () => {
    const query = wikidataQuery('http://www.wikidata.org/entity/Q80')
    expect(query).toContain('<http://www.wikidata.org/entity/Q80> wdt:P18')
  })
})

describe('thumbnail', () => {
  // Wikidata serves portraits at full resolution through a redirect; some are many megabytes.
  it('adds a width to Wikimedia Commons file paths', () => {
    expect(thumbnail('http://commons.wikimedia.org/wiki/Special:FilePath/LS3%20491')).toBe(
      'http://commons.wikimedia.org/wiki/Special:FilePath/LS3%20491?width=160',
    )
  })

  it('leaves other images alone', () => {
    expect(thumbnail('https://pieterheyvaert.com/img/profile.jpg')).toBe('https://pieterheyvaert.com/img/profile.jpg')
  })
})

import { describe, expect, it } from 'vitest'
import { ME, coauthorQuery, foldGraph, pairCount } from '../src/scripts/graph-queries'

describe('coauthorQuery', () => {
  it('counts distinct articles per author pair, each pair once', () => {
    const q = coauthorQuery()
    expect(q).toContain('schema:ScholarlyArticle')
    expect(q).toContain('COUNT(DISTINCT ?pub)')
    expect(q).toContain('FILTER(STR(?a) < STR(?b))')
    expect(q).toContain('GROUP BY ?a ?b')
  })
})

describe('foldGraph', () => {
  const a = 'https://a.example/#me'
  const b = 'https://b.example/#me'

  it('sizes each node by its papers with me and keeps every pair as an edge', () => {
    const graph = foldGraph([
      { a: ME, b: a, n: 5 },
      { a: b, b: ME, n: 2 },
      { a, b, n: 1 },
    ])
    expect(graph.nodes).toEqual([
      { iri: a, papers: 5 },
      { iri: b, papers: 2 },
      { iri: ME, papers: 0 },
    ])
    expect(graph.edges).toHaveLength(3)
    expect(graph.edges).toContainEqual({ a, b, n: 1 })
  })

  it('orders nodes largest first and then by IRI, so the drawing is stable', () => {
    const one = foldGraph([{ a: ME, b: b, n: 1 }, { a: ME, b: a, n: 1 }])
    const two = foldGraph([{ a: ME, b: a, n: 1 }, { a: ME, b: b, n: 1 }])
    expect(one.nodes.map((n) => n.iri)).toEqual([a, b, ME])
    expect(two.nodes).toEqual(one.nodes)
  })

  it('ignores self pairs, empty IRIs and zero counts', () => {
    const graph = foldGraph([
      { a, b: a, n: 3 },
      { a: '', b, n: 3 },
      { a, b, n: 0 },
    ])
    expect(graph).toEqual({ nodes: [], edges: [] })
  })
})

describe('pairCount', () => {
  it('reads the typed literal and falls back to zero', () => {
    expect(pairCount('12')).toBe(12)
    expect(pairCount('')).toBe(0)
    expect(pairCount(undefined)).toBe(0)
  })
})

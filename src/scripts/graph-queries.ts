/**
 * The co-author graph's query, and the folding of its results into nodes and edges.
 *
 * DOM-free and Comunica-free like `foaf-queries.ts`, for the same reason: the worker runs
 * the query, this file says what it is and what the rows mean, and the tests cover both.
 *
 * The source is the publications page itself. Every entry there already carries RDFa, a
 * `schema:ScholarlyArticle` with one `schema:author` per co-author, so the graph needs no
 * data of its own: Comunica parses the page the reader is looking at and counts pairs.
 */

/** The RDFa subject of the site's owner, which is also the `resource` of his author links. */
export const ME = 'https://www.rubensworks.net/#me'

/**
 * Every pair of authors and how many articles they share.
 *
 * `STR(?a) < STR(?b)` halves the output: without it every pair arrives twice, once in each
 * order, and the fold would have to merge them.
 */
export function coauthorQuery(): string {
  return `PREFIX schema: <http://schema.org/>
SELECT ?a ?b (COUNT(DISTINCT ?pub) AS ?n) WHERE {
  ?pub a schema:ScholarlyArticle ;
       schema:author ?a , ?b .
  FILTER(STR(?a) < STR(?b))
} GROUP BY ?a ?b`
}

/** One row of the query as the worker hands it over. */
export interface PairRow {
  a: string
  b: string
  n: number
}

export interface GraphNode {
  iri: string
  /** Articles written together with me, which is what sizes the circle. */
  papers: number
}

export interface GraphEdge {
  a: string
  b: string
  /** Articles the two share. */
  n: number
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

/**
 * Turns the pairs into a graph.
 *
 * The pair (me, x) is what sizes x; it is kept as an edge too, drawn faintly, so hovering a
 * person still shows their line to the centre. Nodes come out largest first and then by
 * IRI, so the same rows always give the same drawing.
 */
export function foldGraph(rows: readonly PairRow[], me: string = ME): Graph {
  const papers = new Map<string, number>()
  const edges: GraphEdge[] = []
  for (const row of rows) {
    if (!row.a || !row.b || row.a === row.b || !(row.n > 0)) continue
    if (!papers.has(row.a)) papers.set(row.a, 0)
    if (!papers.has(row.b)) papers.set(row.b, 0)
    if (row.a === me) papers.set(row.b, row.n)
    else if (row.b === me) papers.set(row.a, row.n)
    edges.push({ a: row.a, b: row.b, n: row.n })
  }
  const nodes = [...papers]
    .map(([iri, n]) => ({ iri, papers: n }))
    .sort((x, y) => y.papers - x.papers || (x.iri < y.iri ? -1 : 1))
  return { nodes, edges }
}

/** Parses the `?n` binding, which arrives as a typed literal. */
export function pairCount(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) ? n : 0
}

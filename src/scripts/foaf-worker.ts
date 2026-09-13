/**
 * Runs Comunica off the main thread.
 *
 * This is the only place `@comunica/query-sparql` is imported, which is what keeps it out of
 * the page: Vite emits it as its own chunk, fetched when the main thread first constructs
 * the worker and never before. It is around 600 KB gzipped, so that deferral is the point.
 *
 * Off-thread matters for more than the download. Parsing a profile is real work — Turtle,
 * JSON-LD and RDFa parsing, then the joins — and on the main thread it would land as jank
 * while the reader scrolls a publications page carrying 366 author links.
 *
 * One worker serves every feature: the author card, the co-author graph and the publication
 * card. They differ only in the request kind, and sharing the worker means sharing the
 * engine and its dereference cache.
 */
import { QueryEngine } from '@comunica/query-sparql'
import {
  DBLP_ENDPOINT,
  WIKIDATA_ENDPOINT,
  dblpQuery,
  foldFacts,
  isWikidataEntity,
  profileQuery,
  wikidataQuery,
  type Facts,
  type RawFact,
} from './foaf-queries'
import { coauthorQuery, foldGraph, pairCount, type Graph } from './graph-queries'
import {
  citationsQuery,
  citingQuery,
  foldCitations,
  foldCiting,
  type CitationRecord,
  type CitingPaper,
  type Row,
} from './citation-queries'

/**
 * One engine for the worker's whole life, not one per query.
 *
 * Constructing a `QueryEngine` costs about 230 ms of actor wiring, and the instance also
 * holds the dereference cache — so the second hover of the same person answers from memory
 * rather than the network. Measured on the built bundle: 267 ms for the first query in a
 * fresh engine, 11-25 ms of engine overhead for every one after it.
 */
let engine: QueryEngine | undefined

export type Request =
  | {
      id: number
      kind: 'person'
      /** The FOAF or dblp identifier from the author link's `resource` attribute. */
      person: string
      /** The name printed on the page, used to find the person in dblp. */
      displayName: string
    }
  | {
      id: number
      kind: 'coauthors'
      /** The page whose RDFa to read, normally the publications page itself. */
      page: string
    }
  | { id: number; kind: 'citations' }
  | {
      id: number
      kind: 'citing'
      /** A dblp record IRI, from a `citations` answer. */
      record: string
    }

/** A request before the client gives it an id; distributed so each kind keeps its own fields. */
export type RequestBody = Request extends infer R ? (R extends Request ? Omit<R, 'id'> : never) : never

export type Response =
  | { id: number; stage: 'profile' | 'dblp' | 'wikidata'; facts: Facts }
  | { id: number; graph: Graph }
  | { id: number; records: CitationRecord[] }
  | { id: number; citing: CitingPaper[] }
  | { id: number; done: true }
  | { id: number; failed: true; stage: string; reason: string }

/**
 * Profiles are passed as bare URLs on purpose.
 *
 * `_data/knows.yml` mixes Solid pods, static Turtle, JSON-LD, RDFa in plain HTML, dblp
 * identifiers and Triple Pattern Fragments endpoints, and Comunica identifies each one
 * itself. Declaring types here would mean maintaining a parallel classification of Ruben's
 * own address book, and getting it wrong would silently drop a source.
 *
 * The two SPARQL endpoints are the exception, and are typed. Given a bare URL Comunica
 * still detects the endpoint, but it then plans the query itself and sends the endpoint one
 * triple pattern at a time; typed, the whole query goes over in one request. Measured on
 * the all-records citation query: 7 seconds bare, 0.2 seconds typed.
 */
type Source = string | { type: 'sparql'; value: string }

const endpoint = (url: string): Source => ({ type: 'sparql', value: url })

async function select(query: string, sources: Source[]): Promise<Row[]> {
  engine ??= new QueryEngine()
  // `lenient` so that one unreachable source degrades to fewer facts rather than no tooltip.
  const bindings = await engine.queryBindings(query, { sources, lenient: true })
  const rows: Row[] = []
  for (const binding of await bindings.toArray()) {
    const row: Row = {}
    for (const [variable, term] of binding) {
      row[variable.value] = { value: term.value, termType: term.termType }
    }
    rows.push(row)
  }
  return rows
}

/** The `?k`/`?v` shape the person queries share. */
async function ask(query: string, sources: Source[]): Promise<RawFact[]> {
  engine ??= new QueryEngine()
  const bindings = await engine.queryBindings(query, { sources, lenient: true })
  const rows: RawFact[] = []
  for (const binding of await bindings.toArray()) {
    const k = binding.get('k')
    const v = binding.get('v')
    if (!k || !v) continue
    rows.push({
      k: k.value,
      v: v.value,
      termType: v.termType,
      language: 'language' in v && v.language ? v.language : undefined,
    })
  }
  return rows
}

type Post = (r: Response) => void

const reason = (error: unknown): string => String((error as Error)?.message ?? error)

/**
 * Three stages, each posted the moment it resolves.
 *
 * They run in sequence rather than as one federated query for two reasons. A single query
 * spanning dblp and Wikidata did not finish inside 30 seconds in testing, because neither
 * endpoint can push a filter the other one owns. And staging means the reader sees the
 * person's own name and portrait after about half a second instead of waiting on Wikidata,
 * which takes closer to three.
 */
async function person(id: number, who: string, displayName: string, post: Post): Promise<void> {
  let merged: Facts = {}

  const stage = async (name: 'profile' | 'dblp' | 'wikidata', query: string, sources: Source[]) => {
    try {
      const facts = foldFacts(await ask(query, sources))
      // Earlier stages win: what someone publishes about themselves outranks a third party.
      merged = { ...facts, ...merged }
      post({ id, stage: name, facts: merged })
      return facts
    } catch (error) {
      post({ id, failed: true, stage: name, reason: reason(error) })
      return {} as Facts
    }
  }

  // A dblp identifier is not a document; its RDF lives only behind the endpoint.
  if (!who.startsWith('https://dblp.org/pid/')) {
    await stage('profile', profileQuery(who), [who])
  }
  const dblp = await stage('dblp', dblpQuery(who, displayName), [endpoint(DBLP_ENDPOINT)])
  const entity = dblp.wikidata ?? merged.wikidata
  // Only worth a second endpoint round trip when something is still missing, and only for
  // an IRI of the one shape the query is written for.
  if (entity && isWikidataEntity(entity) && !(merged.image && merged.description)) {
    await stage('wikidata', wikidataQuery(entity), [endpoint(WIKIDATA_ENDPOINT)])
  }
}

async function coauthors(id: number, page: string, post: Post): Promise<void> {
  const rows = await select(coauthorQuery(), [page])
  const pairs = rows.map((row) => ({
    a: row.a?.value ?? '',
    b: row.b?.value ?? '',
    n: pairCount(row.n?.value),
  }))
  post({ id, graph: foldGraph(pairs) })
}

async function citations(id: number, post: Post): Promise<void> {
  post({ id, records: foldCitations(await select(citationsQuery(), [endpoint(DBLP_ENDPOINT)])) })
}

async function citing(id: number, record: string, post: Post): Promise<void> {
  post({ id, citing: foldCiting(await select(citingQuery(record), [endpoint(DBLP_ENDPOINT)])) })
}

async function handle(request: Request, post: Post): Promise<void> {
  const { id } = request
  try {
    if (request.kind === 'person') await person(id, request.person, request.displayName, post)
    else if (request.kind === 'coauthors') await coauthors(id, request.page, post)
    else if (request.kind === 'citations') await citations(id, post)
    else if (request.kind === 'citing') await citing(id, request.record, post)
  } catch (error) {
    post({ id, failed: true, stage: request.kind, reason: reason(error) })
  }
  post({ id, done: true })
}

/**
 * Requests are answered by id, never in order.
 *
 * Reading down an author list starts several lookups that overlap, and they finish out of
 * order; the id is what lets the main thread match an answer to the link still under the
 * cursor and drop the rest.
 */
self.addEventListener('message', (event: MessageEvent<Request>) => {
  void handle(event.data, (response) => self.postMessage(response))
})

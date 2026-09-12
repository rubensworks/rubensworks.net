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
 */
import { QueryEngine } from '@comunica/query-sparql'
import {
  DBLP_ENDPOINT,
  WIKIDATA_ENDPOINT,
  dblpQuery,
  foldFacts,
  profileQuery,
  wikidataQuery,
  type Facts,
  type RawFact,
} from './foaf-queries'

/**
 * One engine for the worker's whole life, not one per query.
 *
 * Constructing a `QueryEngine` costs about 230 ms of actor wiring, and the instance also
 * holds the dereference cache — so the second hover of the same person answers from memory
 * rather than the network. Measured on the built bundle: 267 ms for the first query in a
 * fresh engine, 11-25 ms of engine overhead for every one after it.
 */
let engine: QueryEngine | undefined

export interface Request {
  id: number
  /** The FOAF or dblp identifier from the author link's `resource` attribute. */
  person: string
  /** The name printed on the page, used to find the person in dblp. */
  displayName: string
}

export type Response =
  | { id: number; stage: 'profile' | 'dblp' | 'wikidata'; facts: Facts }
  | { id: number; done: true }
  | { id: number; failed: true; stage: string; reason: string }

/**
 * Sources are passed as bare URLs on purpose.
 *
 * `_data/knows.yml` mixes Solid pods, static Turtle, JSON-LD, RDFa in plain HTML, dblp
 * identifiers and Triple Pattern Fragments endpoints, and Comunica identifies each one
 * itself. Declaring types here would mean maintaining a parallel classification of Ruben's
 * own address book, and getting it wrong would silently drop a source.
 */
async function ask(query: string, sources: string[]): Promise<RawFact[]> {
  engine ??= new QueryEngine()
  // `lenient` so that one unreachable source degrades to fewer facts rather than no tooltip.
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

/**
 * Three stages, each posted the moment it resolves.
 *
 * They run in sequence rather than as one federated query for two reasons. A single query
 * spanning dblp and Wikidata did not finish inside 30 seconds in testing, because neither
 * endpoint can push a filter the other one owns. And staging means the reader sees the
 * person's own name and portrait after about half a second instead of waiting on Wikidata,
 * which takes closer to three.
 */
async function handle(request: Request, post: (r: Response) => void): Promise<void> {
  const { id, person, displayName } = request
  let merged: Facts = {}

  const stage = async (name: 'profile' | 'dblp' | 'wikidata', query: string, sources: string[]) => {
    try {
      const facts = foldFacts(await ask(query, sources))
      // Earlier stages win: what someone publishes about themselves outranks a third party.
      merged = { ...facts, ...merged }
      post({ id, stage: name, facts: merged })
      return facts
    } catch (error) {
      post({ id, failed: true, stage: name, reason: String((error as Error)?.message ?? error) })
      return {} as Facts
    }
  }

  // A dblp identifier is not a document; its RDF lives only behind the endpoint.
  if (!person.startsWith('https://dblp.org/pid/')) {
    await stage('profile', profileQuery(person), [person])
  }
  const dblp = await stage('dblp', dblpQuery(person, displayName), [DBLP_ENDPOINT])
  const entity = dblp.wikidata ?? merged.wikidata
  // Only worth a second endpoint round trip when something is still missing.
  if (entity && !(merged.image && merged.description)) {
    await stage('wikidata', wikidataQuery(entity), [WIKIDATA_ENDPOINT])
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

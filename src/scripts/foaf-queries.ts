/**
 * The SPARQL this feature runs, and the folding of its results into something renderable.
 *
 * Kept free of both DOM and Comunica so it can be unit-tested directly: the worker supplies
 * the engine, this file supplies the queries and interprets the bindings.
 *
 * Every query returns the same shape — a `?k`/`?v` pair per fact — so one folding function
 * covers all three stages. The alternative, a `SELECT` with one variable per field, needs
 * stacked `OPTIONAL`s, and those multiply: a profile with four `foaf:homepage` values
 * returns four identical rows for every other field. `UNION` of single-predicate blocks
 * keeps it to one row per fact.
 */

/** A fact and where it came from, ready to render. */
export interface Facts {
  name?: string
  given?: string
  family?: string
  image?: string
  title?: string
  org?: string
  affiliation?: string
  description?: string
  /** Only used to chain the DBLP stage into the Wikidata one; never rendered. */
  wikidata?: string
}

export type FactKey = keyof Facts

/** The keys whose values are IRIs. Everything else is only kept if it is a literal. */
const IRI_KEYS: ReadonlySet<string> = new Set(['image', 'wikidata'])

export const DBLP_ENDPOINT = 'https://sparql.dblp.org/sparql'
export const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'

/** dblp person identifiers, which `_data/knows.yml` uses where someone has no FOAF profile. */
export function isDblpPerson(uri: string): boolean {
  return /^https?:\/\/dblp\.org\/pid\/[^\s]+$/.test(uri) && !uri.endsWith('.html')
}

/**
 * The only IRIs ever rendered as a link or an image. A profile is somebody else's document
 * and can publish any string as an IRI, `javascript:` included.
 */
export function httpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/**
 * The one shape of Wikidata entity the third stage interpolates into its query. Anything
 * else, whatever dblp or a profile says, stays out of the query text.
 */
export function isWikidataEntity(iri: string): boolean {
  return /^http:\/\/www\.wikidata\.org\/entity\/Q\d+$/.test(iri)
}

/** Escapes a string for use as a SPARQL literal. */
export function sparqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`
}

/**
 * Stage 1: whatever the person publishes about themselves, read from their own document.
 *
 * `?person` is interpolated rather than bound through `VALUES` so that Comunica sees a
 * concrete subject in every pattern and does not scan the document.
 */
export function profileQuery(person: string): string {
  const s = `<${person}>`
  return `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX schema: <http://schema.org/>
PREFIX vcard: <http://www.w3.org/2006/vcard/ns#>
SELECT DISTINCT ?k ?v WHERE {
  { ${s} foaf:name|schema:name|vcard:fn ?v BIND("name" AS ?k) }
  UNION { ${s} foaf:givenName|schema:givenName ?v BIND("given" AS ?k) }
  UNION { ${s} foaf:familyName|foaf:family_name|schema:familyName ?v BIND("family" AS ?k) }
  UNION { ${s} foaf:img|foaf:depiction|schema:image ?v BIND("image" AS ?k) }
  UNION { ${s} vcard:title|vcard:role|schema:jobTitle ?v BIND("title" AS ?k) }
  UNION { ${s} vcard:organization-name|schema:worksFor ?v BIND("org" AS ?k) }
} LIMIT 100`
}

/**
 * Stage 2: affiliation and identifiers from dblp, for the people whose own profile is thin
 * or missing. Matched on the dblp entity when `_data/knows.yml` already names one, and on
 * the exact printed name otherwise.
 */
export function dblpQuery(person: string, displayName: string): string {
  const subject = isDblpPerson(person)
    ? `BIND(<${person}> AS ?a)`
    : `?a rdfs:label ${sparqlString(displayName)} ; a dblp:Person .`
  return `PREFIX dblp: <https://dblp.org/rdf/schema#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT DISTINCT ?k ?v WHERE {
  ${subject}
  { ?a dblp:primaryAffiliation ?v BIND("affiliation" AS ?k) }
  UNION { ?a dblp:wikidata ?v BIND("wikidata" AS ?k) }
} LIMIT 20`
}

/** Stage 3: a one-line description, and a portrait for the few people who have one. */
export function wikidataQuery(entity: string): string {
  if (!isWikidataEntity(entity)) throw new Error(`Not a Wikidata entity: ${entity}`)
  return `PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX schema: <http://schema.org/>
SELECT DISTINCT ?k ?v WHERE {
  { <${entity}> wdt:P18 ?v BIND("image" AS ?k) }
  UNION { <${entity}> schema:description ?v FILTER(LANG(?v) = "en") BIND("description" AS ?k) }
} LIMIT 10`
}

/** One row as the worker hands it over: the fact name, its value, and the term type. */
export interface RawFact {
  k: string
  v: string
  /** `NamedNode` for an IRI, `Literal` for a literal. */
  termType: string
  /** Language tag, where the value is a literal that carries one. */
  language?: string
}

/**
 * Collapses the rows into one value per field.
 *
 * Profiles disagree about almost everything, so the choices here matter more than they look:
 *
 *  - English wins. `ruben.verborgh.org` publishes every name twice, `@en` and `@nl`, and
 *    picking whichever arrived first makes the tooltip's language depend on join order.
 *  - IRI fields keep only IRIs and text fields keep only literals. `schema:worksFor` is a
 *    node on some profiles, and rendering its IRI as an organisation name reads as garbage.
 *  - Shortest wins among equals, which prefers "Prof. dr." to a four-line biography in the
 *    one field a tooltip has room for.
 */
export function foldFacts(rows: readonly RawFact[]): Facts {
  const best = new Map<string, RawFact>()
  for (const row of rows) {
    const wantsIri = IRI_KEYS.has(row.k)
    if (wantsIri !== (row.termType === 'NamedNode')) continue
    if (!row.v.trim()) continue
    // An IRI field only ever holds something a browser may safely fetch or link to.
    if (wantsIri && !httpUrl(row.v)) continue
    const held = best.get(row.k)
    if (!held || preferable(row, held)) best.set(row.k, row)
  }
  const out: Facts = {}
  for (const [k, row] of best) out[k as FactKey] = row.v
  return out
}

function preferable(candidate: RawFact, held: RawFact): boolean {
  const rank = (r: RawFact) => (r.language === 'en' ? 0 : r.language ? 2 : 1)
  const byLanguage = rank(candidate) - rank(held)
  if (byLanguage !== 0) return byLanguage < 0
  return candidate.v.length < held.v.length
}

/**
 * The name to show. A profile's own `foaf:name` is the most authoritative, then its name
 * parts, and the name printed on the page is the fallback — Femke Ongenae's profile, for
 * one, publishes `foaf:givenName` and `foaf:familyName` but no `foaf:name`.
 */
export function displayNameFor(facts: Facts, fallback: string): string {
  if (facts.name) return facts.name
  const parts = [facts.given, facts.family].filter(Boolean)
  return parts.length ? parts.join(' ') : fallback
}

/** Whether there is anything worth showing beyond the name already printed on the page. */
export function hasSubstance(facts: Facts, displayName: string): boolean {
  if (facts.image || facts.title || facts.affiliation || facts.description || facts.org) return true
  return Boolean(facts.name && facts.name !== displayName)
}

/** Wikidata serves portraits through a redirect; ask for a thumbnail rather than the original. */
export function thumbnail(url: string): string {
  return url.includes('commons.wikimedia.org/wiki/Special:FilePath/')
    ? `${url}${url.includes('?') ? '&' : '?'}width=160`
    : url
}

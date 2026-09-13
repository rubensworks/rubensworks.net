/**
 * The publication card's queries against dblp, and the folding of their rows.
 *
 * dblp mirrors the OpenCitations index: each record with a `dblp:omid` can be joined to
 * `cito:hasCitedEntity`, so one endpoint answers both "what is this paper" and "who cites
 * it". Two queries, because they run at different moments:
 *
 *  - `citationsQuery` fetches every record of mine with its citation count, in one round
 *    trip, on the first hover, and the result is cached for a week. No per-entry requests.
 *  - `citingQuery` fetches the papers citing one record, ranked by their own citation count,
 *    when its card opens.
 *
 * Matched on my dblp identifier, never on a name: "Ruben Taelman" as a label happens to be
 * unique today, but the identifier is what dblp promises to keep stable.
 */

export const DBLP_ENDPOINT = 'https://sparql.dblp.org/sparql'

/** My dblp person identifier. */
export const MY_DBLP = 'https://dblp.org/pid/180/1760'

/** How long the all-records result is kept: a week, since citation counts move slowly. */
export const CITATIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** A dblp record IRI, which is the only thing `citingQuery` will interpolate. */
export function isDblpRecord(iri: string): boolean {
  return /^https:\/\/dblp\.org\/rec\/[A-Za-z0-9._/-]+$/.test(iri)
}

/** Every record of mine with its metadata and, where dblp knows the OpenCitations id, its citation count. */
export function citationsQuery(author: string = MY_DBLP): string {
  return `PREFIX dblp: <https://dblp.org/rdf/schema#>
PREFIX cito: <http://purl.org/spar/cito/>
SELECT ?publ ?title ?year ?venue ?pages ?doi ?omid ?creators
       (COUNT(DISTINCT ?citation) AS ?cites) WHERE {
  ?publ dblp:authoredBy <${author}> ;
        dblp:title ?title ;
        dblp:yearOfPublication ?year .
  OPTIONAL { ?publ dblp:publishedIn ?venue }
  OPTIONAL { ?publ dblp:pagination ?pages }
  OPTIONAL { ?publ dblp:doi ?doi }
  OPTIONAL { ?publ dblp:numberOfCreators ?creators }
  OPTIONAL { ?publ dblp:omid ?omid .
             OPTIONAL { ?citation cito:hasCitedEntity ?omid } }
} GROUP BY ?publ ?title ?year ?venue ?pages ?doi ?omid ?creators`
}

/** The papers citing one record, most cited first. */
export function citingQuery(record: string, limit = 3): string {
  if (!isDblpRecord(record)) throw new Error(`Not a dblp record: ${record}`)
  return `PREFIX dblp: <https://dblp.org/rdf/schema#>
PREFIX cito: <http://purl.org/spar/cito/>
SELECT ?citing ?title ?year (COUNT(DISTINCT ?c2) AS ?cites) WHERE {
  <${record}> dblp:omid ?omid .
  ?c1 cito:hasCitedEntity ?omid ;
      cito:hasCitingEntity ?citingOmid .
  ?citing dblp:omid ?citingOmid ;
          dblp:title ?title ;
          dblp:yearOfPublication ?year .
  OPTIONAL { ?c2 cito:hasCitedEntity ?citingOmid }
} GROUP BY ?citing ?title ?year ORDER BY DESC(?cites) LIMIT ${limit}`
}

/** One binding as the worker hands it over. */
export interface Cell {
  value: string
  termType: string
}

export type Row = Record<string, Cell | undefined>

export interface CitationRecord {
  record: string
  title: string
  year: string
  venue?: string
  pages?: string
  doi?: string
  omid?: string
  /** dblp's `numberOfCreators`, as printed. */
  creators?: string
  /**
   * Citations in the OpenCitations index. Absent when the record has no `dblp:omid`, which
   * means the index does not cover it, not that nobody cites it. Never rendered as a zero.
   */
  cites?: number
}

export interface CitingPaper {
  record: string
  title: string
  year: string
  cites: number
}

const text = (row: Row, name: string): string | undefined => {
  const cell = row[name]
  return cell && cell.value.trim() ? cell.value.trim() : undefined
}

const iri = (row: Row, name: string): string | undefined => {
  const cell = row[name]
  return cell && cell.termType === 'NamedNode' ? cell.value : undefined
}

const count = (row: Row, name: string): number | undefined => {
  const n = Number.parseInt(row[name]?.value ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/** dblp ends every title in a full stop, which the page's titles do not carry. */
export function cleanTitle(title: string): string {
  return title.replace(/\.\s*$/, '').trim()
}

/**
 * One record per dblp IRI. A record with several DOIs or venues arrives as several rows;
 * the first complete one wins, since they differ only in that repeated field.
 */
export function foldCitations(rows: readonly Row[]): CitationRecord[] {
  const out = new Map<string, CitationRecord>()
  for (const row of rows) {
    const record = iri(row, 'publ')
    const title = text(row, 'title')
    if (!record || !title || !isDblpRecord(record)) continue
    if (out.has(record)) continue
    const omid = iri(row, 'omid')
    out.set(record, {
      record,
      title: cleanTitle(title),
      year: text(row, 'year') ?? '',
      venue: text(row, 'venue'),
      pages: text(row, 'pages'),
      doi: iri(row, 'doi'),
      omid,
      creators: text(row, 'creators'),
      cites: omid ? count(row, 'cites') : undefined,
    })
  }
  return [...out.values()]
}

/** The citing papers, most cited first, one per record. */
export function foldCiting(rows: readonly Row[], limit = 3): CitingPaper[] {
  const seen = new Set<string>()
  const out: CitingPaper[] = []
  for (const row of rows) {
    const record = iri(row, 'citing')
    const title = text(row, 'title')
    if (!record || !title || !isDblpRecord(record) || seen.has(record)) continue
    seen.add(record)
    out.push({ record, title: cleanTitle(title), year: text(row, 'year') ?? '', cites: count(row, 'cites') ?? 0 })
  }
  return out.sort((a, b) => b.cites - a.cites).slice(0, limit)
}

/**
 * What two titles have to agree on to be the same paper: letters and digits, case-folded.
 * dblp capitalises differently, ends in a full stop, and sometimes swaps a dash for a colon.
 */
export function normaliseTitle(title: string): string {
  return title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * A DOI as a bare, lower-case identifier: `10.1007/978-3-030-00668-6_15`. DOIs are
 * case-insensitive, dblp upper-cases them, publishers do not, and the page carries them
 * either bare or as a doi.org URL.
 */
export function normaliseDoi(doi: string | undefined): string | undefined {
  const bare = (doi ?? '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .toLowerCase()
  return /^10\.\d{4,9}\/\S+$/.test(bare) ? bare : undefined
}

/**
 * The record for an entry on the page: by DOI when the entry has one, which is exact, and
 * by title otherwise. A title match can confuse a workshop paper with its journal version;
 * a DOI cannot.
 */
export function findRecord(records: readonly CitationRecord[], title: string, doi?: string): CitationRecord | undefined {
  const wantedDoi = normaliseDoi(doi)
  if (wantedDoi) {
    const byDoi = records.find((r) => normaliseDoi(r.doi) === wantedDoi)
    if (byDoi) return byDoi
  }
  const wanted = normaliseTitle(title)
  return wanted ? records.find((r) => normaliseTitle(r.title) === wanted) : undefined
}

/** The DOI as people write it, for the link text. */
export function shortDoi(doi: string): string {
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, 'doi:')
}

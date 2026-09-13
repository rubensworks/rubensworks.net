/**
 * The publication card: what dblp and the OpenCitations index know about a paper, drawn on
 * its title in a bibliography. `foaf-tooltip.ts` decides when it opens and where it goes;
 * this file fetches and renders.
 *
 * Nothing is fetched until the first title is hovered. That first hover costs one round
 * trip for every record of mine, which is then kept in localStorage for a week; each card
 * after that is a lookup by title, plus one small query for the papers citing it.
 *
 * Everything shown comes from a third party, so it is only ever written with `textContent`,
 * and the only IRIs that become links are `http(s)` ones.
 */
import { httpUrl } from './foaf-queries'
import {
  CITATIONS_TTL_MS,
  DBLP_ENDPOINT,
  MY_DBLP,
  citationsQuery,
  citingQuery,
  findRecord,
  shortDoi,
  type CitationRecord,
  type CitingPaper,
} from './citation-queries'
import { send } from './worker-client'

const RECORDS_KEY = `citations:v1:${MY_DBLP}`
const CITING_PREFIX = 'citing:v1:'

export interface PublicationCard {
  root: HTMLElement
  /** Shows the card for a title. `onChange` runs after every re-render, so it can be re-placed. */
  open(title: string, onChange: () => void): void
  close(): void
}

interface Stored {
  at: number
  records: CitationRecord[]
}

// -- the records, one round trip for all of them ----------------------------------------

let records: CitationRecord[] | undefined
let recordsFailed = false
let recordsWaiting: Array<() => void> | undefined

function storedRecords(): CitationRecord[] | undefined {
  try {
    const raw = localStorage.getItem(RECORDS_KEY)
    if (!raw) return undefined
    const stored = JSON.parse(raw) as Stored
    if (!Array.isArray(stored.records) || Date.now() - stored.at > CITATIONS_TTL_MS) return undefined
    return stored.records
  } catch {
    return undefined
  }
}

function storeRecords(found: CitationRecord[]): void {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify({ at: Date.now(), records: found } satisfies Stored))
  } catch {
    // Storage full or unavailable: the in-memory copy still serves this page view.
  }
}

/** Calls back once the records are known, from cache or from one query for all of them. */
function withRecords(callback: () => void): void {
  if (records || recordsFailed) return callback()
  records = storedRecords()
  if (records) return callback()
  if (recordsWaiting) {
    recordsWaiting.push(callback)
    return
  }
  recordsWaiting = [callback]
  send({ kind: 'citations' }, (response) => {
    if ('records' in response) {
      records = response.records
      storeRecords(records)
    } else if ('done' in response) {
      if (!records) recordsFailed = true
      const waiting = recordsWaiting ?? []
      recordsWaiting = undefined
      for (const waiter of waiting) waiter()
    }
  })
}

// -- the citing papers, per record ---------------------------------------------------------

const citingMemory = new Map<string, CitingPaper[]>()

function storedCiting(record: string): CitingPaper[] | undefined {
  const held = citingMemory.get(record)
  if (held) return held
  try {
    const raw = sessionStorage.getItem(CITING_PREFIX + record)
    if (!raw) return undefined
    const papers = JSON.parse(raw) as CitingPaper[]
    citingMemory.set(record, papers)
    return papers
  } catch {
    return undefined
  }
}

function withCiting(record: string, callback: (papers: CitingPaper[] | undefined) => void): void {
  const known = storedCiting(record)
  if (known) return callback(known)
  let found: CitingPaper[] | undefined
  send({ kind: 'citing', record }, (response) => {
    if ('citing' in response) {
      found = response.citing
      citingMemory.set(record, found)
      try {
        sessionStorage.setItem(CITING_PREFIX + record, JSON.stringify(found))
      } catch {
        // Same as above: memory is enough.
      }
    } else if ('done' in response) {
      callback(found)
    }
  })
}

// -- the card -----------------------------------------------------------------------------

export function publicationCard(): PublicationCard {
  const root = document.createElement('div')
  root.className = 'pub-card'
  root.id = 'pub-card'
  root.setAttribute('role', 'tooltip')
  root.hidden = true
  root.innerHTML = `
    <div class="pub-card-head">
      <p class="pub-card-title"></p>
      <p class="pub-card-meta" hidden></p>
      <p class="pub-card-ids" hidden></p>
    </div>
    <div class="pub-card-cites" hidden>
      <p class="pub-card-count"><span class="pub-card-number"></span><small>citations</small></p>
      <p class="pub-card-count-source">OpenCitations index, via dblp</p>
    </div>
    <div class="pub-card-citing" hidden>
      <p class="pub-card-heading">Most cited papers citing it</p>
      <ol></ol>
    </div>
    <p class="pub-card-empty" hidden></p>
    <footer class="foaf-card-source">
      <span class="foaf-card-engine"></span>
      <button type="button" class="foaf-card-toggle" aria-expanded="false">show query</button>
    </footer>
    <pre class="foaf-card-query" hidden></pre>`
  const pick = (selector: string) => root.querySelector(selector) as HTMLElement
  const parts = {
    title: pick('.pub-card-title'),
    meta: pick('.pub-card-meta'),
    ids: pick('.pub-card-ids'),
    cites: pick('.pub-card-cites'),
    number: pick('.pub-card-number'),
    citing: pick('.pub-card-citing'),
    list: pick('.pub-card-citing ol'),
    empty: pick('.pub-card-empty'),
    engine: pick('.foaf-card-engine'),
    toggle: pick('.foaf-card-toggle'),
    query: pick('.foaf-card-query'),
  }

  let current: string | undefined
  let onChange: () => void = () => {}
  let queryOpen = false

  const setQueryOpen = (open: boolean) => {
    queryOpen = open
    parts.query.hidden = !open
    parts.toggle.setAttribute('aria-expanded', String(open))
    parts.toggle.textContent = open ? 'hide query' : 'show query'
  }
  parts.toggle.addEventListener('click', () => {
    setQueryOpen(!queryOpen)
    onChange()
  })

  const setText = (node: HTMLElement, value: string | undefined) => {
    node.textContent = value ?? ''
    node.hidden = !value
  }

  const link = (label: string, iri: string | undefined): HTMLAnchorElement | undefined => {
    const href = httpUrl(iri)
    if (!href) return undefined
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = label
    return a
  }

  const describe = (record: CitationRecord | undefined): string => {
    const sections = [
      '# Everything above was queried live in your browser by Comunica',
      '',
      `# Source: ${DBLP_ENDPOINT}`,
      '# One round trip for every record of mine, kept for a week',
      citationsQuery(),
    ]
    if (record?.omid && record.cites) {
      sections.push('', `# Source: ${DBLP_ENDPOINT}`, '# The papers citing this record, when its card opens', citingQuery(record.record))
    }
    return sections.join('\n')
  }

  type State = 'loading' | 'ready' | 'unavailable'

  const render = (title: string, state: State, record: CitationRecord | undefined, citing: CitingPaper[] | undefined) => {
    parts.title.textContent = record?.title ?? title
    root.classList.toggle('is-loading', state === 'loading')

    if (state !== 'ready' || !record) {
      parts.meta.hidden = parts.ids.hidden = parts.cites.hidden = parts.citing.hidden = true
      setText(
        parts.empty,
        state === 'loading'
          ? undefined
          : state === 'unavailable'
            ? 'dblp did not answer.'
            : 'Comunica found no dblp record with this title.',
      )
    } else {
      const meta: string[] = []
      if (record.venue) meta.push(record.year ? `${record.venue}, ${record.year}` : record.venue)
      else if (record.year) meta.push(record.year)
      if (record.pages) meta.push(`pp. ${record.pages}`)
      if (record.creators) meta.push(`${record.creators} ${record.creators === '1' ? 'author' : 'authors'}`)
      setText(parts.meta, meta.join(' · '))

      parts.ids.replaceChildren()
      const links = [
        record.doi && link(shortDoi(record.doi), record.doi),
        link('dblp record', record.record),
        record.omid && link('OpenCitations', record.omid),
      ].filter((a): a is HTMLAnchorElement => Boolean(a))
      links.forEach((a, i) => {
        if (i) parts.ids.append(' · ')
        parts.ids.append(a)
      })
      parts.ids.hidden = links.length === 0

      const cited = Boolean(record.omid) && (record.cites ?? 0) > 0
      parts.cites.hidden = !cited
      parts.number.textContent = cited ? String(record.cites) : ''
      parts.citing.hidden = !cited || !citing || citing.length === 0
      parts.list.replaceChildren()
      for (const paper of citing ?? []) {
        const li = document.createElement('li')
        const a = link(paper.title, paper.record)
        if (a) li.append(a)
        else li.append(paper.title)
        if (paper.year) {
          const year = document.createElement('span')
          year.className = 'pub-card-year'
          year.textContent = ` (${paper.year})`
          li.append(year)
        }
        if (paper.cites > 0) {
          const n = document.createElement('span')
          n.className = 'pub-card-n'
          n.textContent = ` · ${paper.cites} ${paper.cites === 1 ? 'citation' : 'citations'}`
          li.append(n)
        }
        parts.list.append(li)
      }
      // Never a zero: a record outside the index is not an uncited one.
      setText(
        parts.empty,
        !record.omid
          ? 'Not in the OpenCitations index.'
          : record.cites === 0
            ? 'In the OpenCitations index, no citations recorded yet.'
            : undefined,
      )
    }

    parts.engine.textContent =
      state === 'loading'
        ? 'querying with Comunica…'
        : state === 'unavailable'
          ? 'Comunica got no answer from sparql.dblp.org'
          : record
            ? 'queried live with Comunica from sparql.dblp.org'
            : 'Comunica found nothing at sparql.dblp.org'
    parts.query.textContent = describe(record)
    setQueryOpen(queryOpen)
    root.hidden = false
    onChange()
  }

  const open = (title: string, changed: () => void) => {
    current = title
    onChange = changed
    render(title, 'loading', undefined, undefined)
    withRecords(() => {
      if (current !== title) return
      if (!records) return render(title, 'unavailable', undefined, undefined)
      const record = findRecord(records, title)
      render(title, 'ready', record, undefined)
      if (!record?.omid || !record.cites) return
      withCiting(record.record, (citing) => {
        if (current === title) render(title, 'ready', record, citing)
      })
    })
  }

  const close = () => {
    current = undefined
    root.hidden = true
    setQueryOpen(false)
  }

  document.body.append(root)
  return { root, open, close }
}

/**
 * The co-author graph on the publications page.
 *
 * The page already publishes every co-authorship as RDFa. Opening the panel asks the worker
 * to run one SPARQL query over the page itself, and the answer is drawn here as SVG by the
 * force layout in `graph-layout.ts`. Nothing runs until the panel is opened.
 *
 * The nodes are the same `<a class="author" resource>` links the list uses, so the author
 * card in `foaf-tooltip.ts` works on them unchanged. Clicking one filters the list, with
 * the state in the URL hash so a filtered view can be linked to.
 *
 * Names and links come from this page's own author links, keyed by the `resource` IRI the
 * query returns; the RDFa carries the IRIs but not the printed names. Portraits are the
 * ones the author card would find, fetched lazily after the graph is drawn.
 */
import { httpUrl, thumbnail } from './foaf-queries'
import { ME, type Graph, type GraphNode } from './graph-queries'
import { layoutGraph, radiusFor, type LayoutEdge, type LayoutNode, type Placed } from './graph-layout'
import { lookupPerson } from './person-facts'
import { send, supportsWorker, whenWorkerFails } from './worker-client'

const W = 740
const H = 340
/** Co-authors with fewer papers than this start hidden; the one-paper tail is most of the noise. */
const MIN_PAPERS = 2
/** From how many papers together a name is drawn beside the circle. */
const LABEL_MIN = 4
/** Portraits larger than this are not fetched: some profiles link a multi-megabyte original. */
const PORTRAIT_MAX_BYTES = 512 * 1024
/** How many portrait lookups run at once, so opening the graph does not flood anyone's pod. */
const PORTRAIT_CONCURRENCY = 4

interface Person {
  name: string
  href: string
}

const SVG = 'http://www.w3.org/2000/svg'

const section = document.getElementById('coauthors')

function start(): void {
  if (!section || !supportsWorker()) return
  const body = document.getElementById('coauthors-body')!
  const toggle = document.getElementById('coauthors-toggle')!
  const status = document.getElementById('coauthors-status')!
  const svg = document.getElementById('coauthors-graph') as unknown as SVGSVGElement
  const scope = document.getElementById('coauthors-scope')!
  const filterBar = document.getElementById('coauthors-filter')!
  const queryToggle = document.getElementById('coauthors-query-toggle')!
  const query = document.getElementById('coauthors-query')!

  // Who each IRI is, from the author links already on the page.
  const people = new Map<string, Person>()
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.bibliography a.author[resource]')) {
    const iri = a.getAttribute('resource')!
    if (!people.has(iri)) people.set(iri, { name: (a.textContent ?? '').trim(), href: a.href })
  }

  const items = Array.from(document.querySelectorAll<HTMLLIElement>('ol.bibliography > li'))
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h2.bibliography'))

  let graph: Graph | undefined
  let requested = false
  let minPapers = MIN_PAPERS
  let selected: string | undefined
  let drawn = new Map<string, SVGAElement>()
  let edgesOf = new Map<string, Array<{ line: SVGLineElement; other: string }>>()

  section.hidden = false
  // Without the worker there is no graph, and a broken panel is worse than none.
  whenWorkerFails(() => {
    section.hidden = true
  })

  // -- open and close -------------------------------------------------------------------

  function setOpen(open: boolean): void {
    body.hidden = !open
    section!.setAttribute('data-open', String(open))
    toggle.setAttribute('aria-expanded', String(open))
    toggle.setAttribute('aria-label', `${open ? 'Minimise' : 'Open'} the co-author graph`)
    toggle.title = open ? 'Minimise' : 'Open'
    if (open) request()
  }

  function request(): void {
    if (requested) return
    requested = true
    send({ kind: 'coauthors', page: location.origin + location.pathname }, (response) => {
      if ('graph' in response) {
        graph = response.graph
        status.hidden = true
        svg.removeAttribute('hidden')
        scope.hidden = false
        build()
      } else if ('failed' in response || ('done' in response && !graph)) {
        section!.hidden = true
      }
    })
  }

  toggle.addEventListener('click', () => setOpen(body.hidden))

  queryToggle.addEventListener('click', () => {
    query.hidden = !query.hidden
    queryToggle.setAttribute('aria-expanded', String(!query.hidden))
    queryToggle.textContent = query.hidden ? 'show query' : 'hide query'
  })

  // -- drawing ---------------------------------------------------------------------------

  /**
   * Only IRIs that are the `resource` of an author link on this page. The RDFa parser also
   * yields each link's `href`, so the raw graph holds every person twice; the page's own
   * links say which IRI is the person.
   */
  function knownNodes(): GraphNode[] {
    return (graph?.nodes ?? []).filter((n) => n.iri === ME || people.has(n.iri))
  }

  function visibleNodes(): GraphNode[] {
    return knownNodes().filter((n) => n.iri === ME || n.papers >= minPapers)
  }

  function build(): void {
    if (!graph) return
    const nodes = visibleNodes()
    const shown = new Set(nodes.map((n) => n.iri))
    const layoutNodes: LayoutNode[] = nodes.map((n) => ({
      id: n.iri,
      r: radiusFor(n.papers, n.iri === ME),
      pinned: n.iri === ME,
      labelled: n.iri === ME || n.papers >= LABEL_MIN,
      label: nameOf(n.iri),
    }))
    const layoutEdges: LayoutEdge[] = graph.edges.filter((e) => shown.has(e.a) && shown.has(e.b))
    const placed = layoutGraph(layoutNodes, layoutEdges, { width: W, height: H })
    const at = new Map(placed.map((p) => [p.id, p]))

    svg.replaceChildren()
    drawn = new Map()
    edgesOf = new Map()
    const gEdges = el('g', { class: 'edges' })
    const gNodes = el('g', { class: 'nodes' })
    for (const e of layoutEdges) {
      const a = at.get(e.a)!
      const b = at.get(e.b)!
      const viaMe = e.a === ME || e.b === ME
      const line = el('line', {
        class: viaMe ? 'edge via-me' : 'edge',
        x1: fixed(a.x),
        y1: fixed(a.y),
        x2: fixed(b.x),
        y2: fixed(b.y),
        'stroke-width': fixed(viaMe ? 1 : Math.min(9, 0.8 + 0.9 * e.n)),
      }) as SVGLineElement
      gEdges.append(line)
      listOf(edgesOf, e.a).push({ line, other: e.b })
      listOf(edgesOf, e.b).push({ line, other: e.a })
    }
    // Largest first, so their labels sit under the small circles rather than over them.
    const byPapers = new Map(nodes.map((n) => [n.iri, n.papers]))
    for (const p of [...placed].sort((x, y) => (byPapers.get(y.id) ?? 0) - (byPapers.get(x.id) ?? 0))) {
      gNodes.append(drawNode(p, byPapers.get(p.id) ?? 0))
    }
    svg.append(gEdges, gNodes)
    if (selected) drawn.get(selected)?.classList.add('selected')

    scope.replaceChildren()
    const other = document.createElement('button')
    other.type = 'button'
    const everyone = knownNodes().length - 1
    if (minPapers > 1) {
      scope.append('Showing co-authors with 2+ papers together. ')
      other.textContent = `Show all ${everyone}`
    } else {
      scope.append(`Showing all ${everyone} co-authors. `)
      other.textContent = 'Show only 2+ papers together'
    }
    other.addEventListener('click', () => {
      minPapers = minPapers > 1 ? 1 : MIN_PAPERS
      build()
    })
    scope.append(other)

    loadPortraits(nodes)
  }

  function drawNode(p: Placed, papers: number): SVGAElement {
    const me = p.id === ME
    const person = people.get(p.id)
    const a = el('a', {
      class: ['node', 'author', me && 'me', !me && papers < LABEL_MIN && 'minor'].filter(Boolean).join(' '),
      resource: p.id,
      'aria-label': me ? nameOf(p.id) : `${nameOf(p.id)}, ${papers} ${papers === 1 ? 'paper' : 'papers'} together`,
    }) as SVGAElement
    // Same href as the name in the list; graph nodes never link anywhere the list does not.
    if (person) {
      a.setAttribute('href', person.href)
      a.setAttribute('target', '_blank')
    } else {
      a.setAttribute('href', ME)
    }
    a.append(el('circle', { cx: fixed(p.x), cy: fixed(p.y), r: fixed(p.r) }))
    const text = me
      ? el('text', { x: fixed(p.x), y: fixed(p.y + p.r + 4), dy: '0.9em', 'text-anchor': 'middle' })
      : p.left
        ? el('text', { x: fixed(p.x - p.r - 3), y: fixed(p.y), dy: '0.35em', 'text-anchor': 'end' })
        : el('text', { x: fixed(p.x + p.r + 3), y: fixed(p.y), dy: '0.35em' })
    text.textContent = nameOf(p.id)
    a.append(text)
    const portrait = portraits.get(p.id)
    if (portrait) addPortrait(a, p, portrait)

    a.addEventListener('mouseenter', () => light(p.id, true))
    a.addEventListener('mouseleave', () => light(p.id, false))
    a.addEventListener('click', (event) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || me) return
      event.preventDefault()
      select(selected === p.id ? undefined : p.id)
    })
    drawn.set(p.id, a)
    return a
  }

  function light(iri: string, on: boolean): void {
    svg.classList.toggle('is-dim', on)
    drawn.get(iri)?.classList.toggle('lit', on)
    for (const { line, other } of edgesOf.get(iri) ?? []) {
      line.classList.toggle('lit', on)
      drawn.get(other)?.classList.toggle('lit', on)
    }
  }

  // -- portraits ---------------------------------------------------------------------------

  /** A usable image URL per person, or null once a lookup has settled on none. */
  const portraits = new Map<string, string | null>()
  const portraitQueue: string[] = []
  let portraitsRunning = 0

  /** Every visible node, mine first: the centre should not be the last circle to get a face. */
  function loadPortraits(nodes: GraphNode[]): void {
    const wanted = [...nodes].sort((a, b) => Number(b.iri === ME) - Number(a.iri === ME))
    for (const n of wanted) {
      if (portraits.has(n.iri) || portraitQueue.includes(n.iri)) continue
      portraitQueue.push(n.iri)
    }
    pumpPortraits()
  }

  function pumpPortraits(): void {
    while (portraitsRunning < PORTRAIT_CONCURRENCY && portraitQueue.length) {
      const iri = portraitQueue.shift()!
      portraitsRunning++
      lookupPerson(iri, nameOf(iri), (facts, done) => {
        if (!done) return
        void acceptable(facts?.image).then((url) => {
          portraits.set(iri, url)
          portraitsRunning--
          const node = drawn.get(iri)
          if (url && node && !node.classList.contains('has-portrait')) {
            const circle = node.querySelector('circle')!
            const p = { x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')), r: Number(circle.getAttribute('r')) }
            addPortrait(node, p, url)
          }
          pumpPortraits()
        })
      })
    }
  }

  /**
   * Only an `http(s)` image whose size is known and modest. A HEAD request tells both, and
   * `Content-Length` is readable across origins wherever the host allows CORS at all; a host
   * that does not, or an oversized file, means no portrait rather than a gamble.
   */
  async function acceptable(image: string | undefined): Promise<string | null> {
    const url = httpUrl(image)
    if (!url) return null
    const src = thumbnail(url)
    try {
      const response = await fetch(src, { method: 'HEAD', mode: 'cors', credentials: 'omit', redirect: 'follow' })
      if (!response.ok) return null
      const length = Number.parseInt(response.headers.get('content-length') ?? '', 10)
      const type = response.headers.get('content-type') ?? ''
      if (!Number.isFinite(length) || length <= 0 || length > PORTRAIT_MAX_BYTES) return null
      if (type && !type.startsWith('image/')) return null
      return src
    } catch {
      return null
    }
  }

  function addPortrait(node: SVGAElement, p: { x: number; y: number; r: number }, src: string): void {
    const id = `coauthor-clip-${node.getAttribute('resource')!.replace(/[^A-Za-z0-9]/g, '')}`
    const clip = el('clipPath', { id })
    clip.append(el('circle', { cx: fixed(p.x), cy: fixed(p.y), r: fixed(p.r - 1) }))
    const image = el('image', {
      class: 'portrait',
      x: fixed(p.x - p.r),
      y: fixed(p.y - p.r),
      width: fixed(2 * p.r),
      height: fixed(2 * p.r),
      'clip-path': `url(#${id})`,
      preserveAspectRatio: 'xMidYMid slice',
    })
    image.setAttribute('href', src)
    node.querySelector('circle')!.after(clip, image)
    node.classList.add('has-portrait')
  }

  // -- filtering the list -----------------------------------------------------------------

  function select(iri: string | undefined): void {
    if (selected) drawn.get(selected)?.classList.remove('selected')
    selected = iri && iri !== ME && people.has(iri) ? iri : undefined
    if (selected) drawn.get(selected)?.classList.add('selected')

    const selector = selected ? `a.author[resource="${CSS.escape(selected)}"]` : undefined
    let shown = 0
    for (const li of items) {
      const keep = !selector || Boolean(li.querySelector(selector))
      li.classList.toggle('is-filtered', !keep)
      if (keep) shown++
    }
    for (const h of headings) {
      const list = h.nextElementSibling
      h.classList.toggle('is-filtered', Boolean(list) && !list!.querySelector('li:not(.is-filtered)'))
    }

    filterBar.replaceChildren()
    if (selected) {
      const person = people.get(selected)!
      filterBar.append('Showing ')
      const count = document.createElement('b')
      count.textContent = String(shown)
      filterBar.append(count, ` of ${items.length} publications, with `)
      const who = document.createElement('a')
      who.className = 'author'
      who.href = person.href
      who.target = '_blank'
      who.setAttribute('resource', selected)
      who.textContent = person.name
      filterBar.append(who, '. ')
      const clear = document.createElement('button')
      clear.type = 'button'
      clear.className = 'coauthors-clear'
      clear.textContent = 'Show all'
      clear.addEventListener('click', () => select(undefined))
      filterBar.append(clear)
      filterBar.hidden = false
      history.replaceState(null, '', `#author=${encodeURIComponent(selected)}`)
    } else {
      filterBar.hidden = true
      if (location.hash.startsWith('#author=')) history.replaceState(null, '', location.pathname + location.search)
    }
  }

  function fromHash(): void {
    const match = /^#author=(.+)$/.exec(location.hash)
    if (!match) return
    let iri: string
    try {
      iri = decodeURIComponent(match[1]!)
    } catch {
      return
    }
    if (!people.has(iri)) return
    // A one-paper co-author is only in the full graph.
    if (graph && (graph.nodes.find((n) => n.iri === iri)?.papers ?? 0) < minPapers) {
      minPapers = 1
      build()
    }
    select(iri)
    setOpen(true)
  }

  window.addEventListener('hashchange', fromHash)
  fromHash()

  // -- small helpers ----------------------------------------------------------------------

  function nameOf(iri: string): string {
    return people.get(iri)?.name ?? (iri === ME ? 'Ruben Taelman' : iri)
  }
}

function el(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}

function fixed(n: number): string {
  return n.toFixed(1)
}

function listOf<K, V>(map: Map<K, V[]>, key: K): V[] {
  let list = map.get(key)
  if (!list) {
    list = []
    map.set(key, list)
  }
  return list
}

start()

/**
 * Hover cards, built from Linked Data: an author card on a co-author's name, and a
 * publication card on a paper's title.
 *
 * This file is the whole main-thread cost of the feature: it finds the links, decides when
 * the reader means it, and draws the card. Everything expensive happens in
 * `foaf-worker.ts`, which is why this stays a few kilobytes. The author card is rendered
 * here; the publication card's fetching and rendering live in `publication-card.ts`, and
 * both share the pointer logic below.
 *
 * The links need no markup of their own. `_data/knows.yml` already puts each co-author's
 * FOAF identifier in the `resource` attribute of `a.author`, for the RDFa the pages publish,
 * and that attribute is exactly what a query needs. A publication is found by the title
 * printed in its link.
 */
import {
  DBLP_ENDPOINT,
  WIKIDATA_ENDPOINT,
  dblpQuery,
  displayNameFor,
  hasSubstance,
  httpUrl,
  isDblpPerson,
  isWikidataEntity,
  profileQuery,
  thumbnail,
  wikidataQuery,
  type Facts,
} from './foaf-queries'
import { cachedFacts, lookupPerson } from './person-facts'
import { publicationCard, type PublicationCard } from './publication-card'
import { ensureWorker, whenWorkerFails } from './worker-client'

/** How long the pointer has to rest before this is a lookup and not a passing cursor. */
const DWELL_MS = 180
/**
 * Grace before the card goes, once the pointer is on neither the name nor the card. Wide
 * enough that a pointer travelling through the 8 px gap between them is not caught out.
 */
const HIDE_MS = 120
/**
 * One pixel, for one reason: Chrome reports `MouseEvent.clientX` as an integer while the
 * name's rect is fractional, so a pointer on the last pixel of a glyph can read as one
 * pixel outside it. Anything wider is a halo round the name where the card stays although
 * the pointer has visibly left it — at 4 px the randomised sweep found exactly that.
 */
const HIT_SLACK = 1
/** How many recent papers together the author card lists when opened from the graph. */
const RECENT_TOGETHER = 3

/** Either an author link in the list or the graph, or a title link in the list. */
type Anchor = Element

interface Pending {
  kind: 'person' | 'publication'
  /** The person's IRI, or the publication's printed title. */
  subject: string
  displayName: string
  /** The publication's DOI, from the `schema:sameAs` link its entry publishes, when it has one. */
  doi?: string
  anchor: Anchor
}

let active: Pending | undefined
let dwellTimer: number | undefined
/** The link a dwell is counting down for, or nothing when none is pending. */
let dwellAnchor: Anchor | undefined
let hideTimer: number | undefined
/** The last position the pointer actually reported, which is the only reliable one. */
let pointer: { x: number; y: number } | undefined
/** A card opened by keyboard is dismissed by blur, never by where the mouse happens to be. */
let openedByPointer = false
/**
 * Whether the last real pointer move landed inside the card.
 *
 * Remembered, not measured live, and the asymmetry is the point. The card is drawn 8 px
 * below the name and grows as each query stage lands, so a live test would let it rescue
 * itself by expanding under a pointer that had already left. Only a move that ends inside
 * the card grants this; a re-render that moves the card away from the pointer revokes it.
 */
let onCard = false
/** Whether the query panel is open, kept across the stages that re-render the card. */
let queryOpen = false

// -- the author card -----------------------------------------------------------------------

/** Whichever card is on screen, or was last. */
let card: HTMLElement | undefined
let personCard: HTMLElement | undefined
let parts: Record<string, HTMLElement>
let pubCard: PublicationCard | undefined

function ensurePersonCard(): HTMLElement {
  if (personCard) return personCard
  const root = document.createElement('div')
  root.className = 'foaf-card'
  root.id = 'foaf-card'
  root.setAttribute('role', 'tooltip')
  root.hidden = true
  root.innerHTML = `
    <img class="foaf-card-photo" alt="" hidden />
    <div class="foaf-card-text">
      <p class="foaf-card-name"></p>
      <p class="foaf-card-title" hidden></p>
      <p class="foaf-card-affiliation" hidden></p>
      <p class="foaf-card-description" hidden></p>
      <p class="foaf-card-empty" hidden>No Linked Data published.</p>
    </div>
    <div class="foaf-card-recent" hidden>
      <p class="foaf-card-recent-heading">Most recent together</p>
      <ol></ol>
    </div>
    <footer class="foaf-card-source">
      <span class="foaf-card-engine"></span>
      <button type="button" class="foaf-card-toggle" aria-expanded="false">show query</button>
    </footer>
    <pre class="foaf-card-query" hidden></pre>`
  const pick = (selector: string) => root.querySelector(selector) as HTMLElement
  parts = {
    photo: pick('.foaf-card-photo'),
    name: pick('.foaf-card-name'),
    title: pick('.foaf-card-title'),
    affiliation: pick('.foaf-card-affiliation'),
    description: pick('.foaf-card-description'),
    empty: pick('.foaf-card-empty'),
    recent: pick('.foaf-card-recent'),
    recentList: pick('.foaf-card-recent ol'),
    engine: pick('.foaf-card-engine'),
    toggle: pick('.foaf-card-toggle'),
    query: pick('.foaf-card-query'),
  }
  parts.toggle.addEventListener('click', () => {
    setQueryOpen(!queryOpen)
    if (active) place(active.anchor)
  })
  document.body.append(root)
  personCard = root
  return root
}

function ensurePubCard(): PublicationCard {
  pubCard ??= publicationCard()
  return pubCard
}

function setQueryOpen(open: boolean): void {
  queryOpen = open
  parts.query.hidden = !open
  parts.toggle.setAttribute('aria-expanded', String(open))
  parts.toggle.textContent = open ? 'hide query' : 'show query'
}

function setText(node: HTMLElement, value: string | undefined): void {
  node.textContent = value ?? ''
  node.hidden = !value
}

function render(pending: Pending, facts: Facts | undefined, state: 'loading' | 'ready'): void {
  const root = ensurePersonCard()
  card = root
  const name = facts ? displayNameFor(facts, pending.displayName) : pending.displayName
  parts.name.textContent = name
  setText(parts.title, facts?.title)
  setText(parts.affiliation, facts?.affiliation ?? facts?.org)
  setText(parts.description, facts?.description)

  const photo = parts.photo as HTMLImageElement
  // Only an http(s) IRI is ever loaded; the fold already dropped anything else.
  const image = httpUrl(facts?.image)
  if (image) {
    photo.src = thumbnail(image)
    photo.alt = name
    photo.hidden = false
  } else {
    photo.hidden = true
    photo.removeAttribute('src')
  }

  renderRecent(pending)

  const bare = state === 'ready' && (!facts || !hasSubstance(facts, pending.displayName))
  parts.empty.hidden = !bare
  root.classList.toggle('is-loading', state === 'loading')
  parts.engine.textContent =
    state === 'loading'
      ? 'querying with Comunica…'
      : bare
        ? `Comunica found nothing at ${hostOf(pending.subject)}`
        : `queried live with Comunica from ${hostOf(pending.subject)}`
  parts.query.textContent = describeQuery(pending)
  setQueryOpen(queryOpen)
  root.hidden = false
  afterRender(pending)
}

/**
 * Opened from the co-author graph, the card also lists the newest papers with that person,
 * read from the list on the page itself. The list is newest first, so the first matches
 * are the ones wanted.
 */
function renderRecent(pending: Pending): void {
  parts.recentList.replaceChildren()
  const fromGraph = pending.anchor.closest('#coauthors')
  if (!fromGraph) {
    parts.recent.hidden = true
    return
  }
  const selector = `a.author[resource="${CSS.escape(pending.subject)}"]`
  let found = 0
  for (const li of document.querySelectorAll('ol.bibliography > li')) {
    if (found === RECENT_TOGETHER) break
    if (!li.querySelector(selector)) continue
    const title = li.querySelector<HTMLAnchorElement>('a.title')
    if (!title) continue
    found++
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = title.href
    link.textContent = (title.textContent ?? '').trim()
    item.append(link)
    const year = li.closest('ol')?.previousElementSibling
    if (year?.matches('h2.bibliography')) item.append(` (${(year.textContent ?? '').trim()})`)
    parts.recentList.append(item)
  }
  parts.recent.hidden = found === 0
}

/** Each stage lands separately and can change the card's size or flip it to the other side. */
function afterRender(pending: Pending): void {
  if (active !== pending) return
  place(pending.anchor)
  // A pointer that was on the card may no longer be; the reverse is never granted here,
  // only by a real move.
  if (onCard && !pointerOverCard()) onCard = false
  review()
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).host
  } catch {
    return uri
  }
}

/**
 * The point of the feature is the query, so show the query — the real one, built by the same
 * functions the worker runs, not a readable paraphrase of it.
 */
function describeQuery(pending: Pending): string {
  const dereferenced = !isDblpPerson(pending.subject)
  const sections: string[] = [
    '# Everything above was queried live in your browser by Comunica',
  ]
  if (dereferenced) {
    sections.push('', `# Source: ${pending.subject}`, profileQuery(pending.subject))
  }
  sections.push('', `# Source: ${DBLP_ENDPOINT}`, dblpQuery(pending.subject, pending.displayName))
  if (lastWikidataEntity && isWikidataEntity(lastWikidataEntity)) {
    sections.push('', `# Source: ${WIKIDATA_ENDPOINT}`, wikidataQuery(lastWikidataEntity))
  }
  return sections.join('\n')
}

/** Tracked so the third query is only shown when it actually ran. */
let lastWikidataEntity: string | undefined

function place(anchor: Anchor): void {
  if (!card) return
  const root = card
  const target = anchor.getBoundingClientRect()
  const self = root.getBoundingClientRect()
  const margin = 8
  let left = target.left + window.scrollX
  left = Math.min(left, window.scrollX + document.documentElement.clientWidth - self.width - margin)
  left = Math.max(left, window.scrollX + margin)
  // Below the name normally, above it when that would run off the bottom of the viewport.
  const below = target.bottom + margin
  const fits = below + self.height < window.innerHeight
  const top = fits ? below + window.scrollY : target.top + window.scrollY - self.height - margin
  root.style.left = `${Math.round(left)}px`
  root.style.top = `${Math.round(Math.max(top, window.scrollY + margin))}px`
}

function hide(): void {
  clearDwell()
  cancelHide()
  onCard = false
  if (active) active.anchor.removeAttribute('aria-describedby')
  active = undefined
  if (personCard) {
    personCard.hidden = true
    setQueryOpen(false)
  }
  pubCard?.close()
}

function armDwell(anchor: Anchor): void {
  clearDwell()
  dwellAnchor = anchor
  dwellTimer = window.setTimeout(() => {
    dwellAnchor = undefined
    show(anchor, true)
  }, DWELL_MS)
}

function clearDwell(): void {
  window.clearTimeout(dwellTimer)
  dwellAnchor = undefined
}

function near(rect: DOMRect, x: number, y: number): boolean {
  return (
    x >= rect.left - HIT_SLACK &&
    x <= rect.right + HIT_SLACK &&
    y >= rect.top - HIT_SLACK &&
    y <= rect.bottom + HIT_SLACK
  )
}

/**
 * Whether the name is under the pointer — measured, not inferred.
 *
 * `getClientRects()` rather than `getBoundingClientRect()`: an author name that wraps across
 * two lines has two rects, and the box enclosing both covers most of the line in between.
 */
function pointerOnAnchor(): boolean {
  if (!pointer || !active) return false
  const rects = active.anchor.getClientRects()
  for (let i = 0; i < rects.length; i++) {
    if (near(rects[i]!, pointer.x, pointer.y)) return true
  }
  return false
}

/** Live geometry, used only to revoke a remembered `onCard`, never to grant it. */
function pointerOverCard(): boolean {
  if (!pointer || !card || card.hidden) return false
  return near(card.getBoundingClientRect(), pointer.x, pointer.y)
}

/**
 * The one condition under which a pointer-opened card stays: the name is under the
 * pointer, or the pointer's last move landed on the card. Nothing else — not an event
 * that happened to fire, not the card's box measured after it moved.
 */
function held(): boolean {
  return pointerOnAnchor() || onCard
}

function cancelHide(): void {
  if (hideTimer === undefined) return
  window.clearTimeout(hideTimer)
  hideTimer = undefined
}

/**
 * Idempotent: a pending hide is left to run. Movement does not defer it, because the check
 * that matters happens when it fires — if the pointer has reached the card by then, the
 * card stays; if it has not, it goes.
 */
function scheduleHide(): void {
  if (hideTimer !== undefined) return
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined
    if (openedByPointer && held()) return
    // A dwell already counting down is about to replace this card with the next one, and
    // `hide()` would cancel it — leaving no card at all. Moving straight from one name to
    // the one beside it does exactly that, since the grace period is shorter than a dwell.
    if (dwellAnchor) return
    hide()
  }, HIDE_MS)
}

/**
 * Re-decides whether the card belongs on screen, on every pointer move and every re-render.
 *
 * `mouseover`/`mouseout` are not used at all. They report what crossed the pointer, and
 * Chromium does not reliably dispatch them when the page moves under a still cursor:
 * scrolling 20 px away from a name fires no `mouseout`. A `mousemove`, by contrast, is
 * what a pointer produces by moving, so it is the one event a dismissal can rest on; the
 * scroll and window-exit cases, where the pointer does not move, have their own handlers.
 */
function review(): void {
  if (!active || !openedByPointer) return
  if (held()) cancelHide()
  else scheduleHide()
}

// -- what the reader did --------------------------------------------------------------

function pendingFor(anchor: Anchor): Pending | undefined {
  const displayName = (anchor.textContent ?? '').trim()
  if (anchor.matches('a.author[resource]')) {
    const person = anchor.getAttribute('resource')
    return person ? { kind: 'person', subject: person, displayName, anchor } : undefined
  }
  if (!displayName) return undefined
  const doiLink = anchor.closest('.publication')?.querySelector<HTMLAnchorElement>('a[rel~="schema:sameAs"][href^="https://doi.org/"]')
  return { kind: 'publication', subject: displayName, displayName, doi: doiLink?.href, anchor }
}

function show(anchor: Anchor, byPointer: boolean): void {
  const pending = pendingFor(anchor)
  if (!pending) return
  // Whatever asked for this card wins. Without this, a dwell already counting down on a
  // link the mouse happens to rest over replaces the card a keyboard user just opened
  // somewhere else — focus moves, the timer fires 180 ms later, and the card changes person.
  clearDwell()
  cancelHide()
  // One card at a time: opening the other kind puts the first one away.
  if (active && active.kind !== pending.kind) hide()
  openedByPointer = byPointer
  onCard = false
  active = pending

  if (pending.kind === 'publication') {
    const shown = ensurePubCard()
    card = shown.root
    anchor.setAttribute('aria-describedby', shown.root.id)
    shown.open(pending.subject, pending.doi, () => afterRender(pending))
    return
  }

  anchor.setAttribute('aria-describedby', 'foaf-card')
  lastWikidataEntity = undefined
  const known = cachedFacts(pending.subject)
  if (known) {
    lastWikidataEntity = known.wikidata
    render(pending, known, 'ready')
    return
  }
  render(pending, undefined, 'loading')
  lookupPerson(pending.subject, pending.displayName, (facts, done) => {
    // A result for a link the pointer has already left is worth caching, not showing.
    if (active?.subject !== pending.subject) return
    if (facts) lastWikidataEntity = facts.wikidata
    // Every stage can fail, and then no facts ever arrive. Without the `done` render the
    // card sits on "querying with Comunica…" for as long as the reader keeps pointing at it.
    if (facts || done) render(pending, facts, 'ready')
  })
}

/**
 * The single source of truth for what the pointer is doing.
 *
 * Movement, not arrival, is what arms a lookup: the page scrolling under a still cursor
 * counts as arrival and should open nothing. Each move also restarts the countdown, so a
 * pointer sweeping across a list of names loads none of them.
 */
function onPointerMove(event: MouseEvent): void {
  pointer = { x: event.clientX, y: event.clientY }
  // The card takes pointer events, so this is exact: a move over the card targets the card,
  // never a name it happens to cover, and no lookup can start from there.
  onCard = Boolean(card && !card.hidden && card.contains(event.target as Node))
  const anchor = onCard ? undefined : hoverTarget(event.target)
  if (!anchor) {
    // Off the name before the dwell was met, so there is nothing to look up.
    clearDwell()
  } else if (active?.anchor !== anchor) {
    // The worker starts here rather than when the dwell completes, so its chunk downloads
    // during the pause instead of after it.
    ensureWorker()
    armDwell(anchor)
  }
  review()
}

/** A co-author's name, in the list or on the graph, or a publication's title in the list. */
function hoverTarget(target: EventTarget | null): Anchor | undefined {
  const element = target instanceof Element ? target.closest('a.author[resource], .bibliography a.title') : null
  return element ?? undefined
}

function start(): void {
  if (!document.querySelector('a.author[resource], .bibliography a.title')) return
  // No hover on a touchscreen, and tapping an author link should follow it, not open a card.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  // A worker that cannot start must not take the page's links with it.
  whenWorkerFails(hide)

  document.addEventListener('mousemove', onPointerMove, { passive: true })

  // The pointer left the window, or the window stopped being the one in front. Either way
  // there is no position left to check, so a pointer-opened card goes at once; the last move
  // inside may well have been on the name, and switching windows moves no pointer at all.
  const pointerGone = () => {
    pointer = undefined
    onCard = false
    clearDwell()
    if (openedByPointer) hide()
  }
  document.documentElement.addEventListener('mouseleave', pointerGone)
  window.addEventListener('blur', pointerGone)

  // Keyboard readers get the same card; the author and title links are already focusable.
  document.addEventListener('focusin', (event) => {
    const anchor = hoverTarget(event.target)
    if (anchor) show(anchor, false)
    else if (!card?.contains(event.target as Node)) hide()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })

  const reposition = () => {
    // A dwell counting down belongs to where the name was, not where it has scrolled to.
    clearDwell()
    if (!active) return
    place(active.anchor)
    // The card has just moved under a pointer that did not, so being on it counts for
    // nothing now. Scrolling is the reader moving on: only the name still being under the
    // pointer keeps the card, and it goes at once, without the grace period.
    onCard = false
    if (openedByPointer && !pointerOnAnchor()) hide()
  }
  window.addEventListener('scroll', reposition, { passive: true })
  window.addEventListener('resize', reposition)
}

start()

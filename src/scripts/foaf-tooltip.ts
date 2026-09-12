/**
 * Author cards on hover, built from the person's own Linked Data.
 *
 * This file is the whole main-thread cost of the feature: it finds the author links, decides
 * when the reader means it, and draws the card. Everything expensive happens in
 * `foaf-worker.ts`, which is why this can stay small enough for Astro to inline it.
 *
 * The links need no markup of their own. `_data/knows.yml` already puts each co-author's
 * FOAF identifier in the `resource` attribute of `a.author`, for the RDFa the pages publish,
 * and that attribute is exactly what a query needs.
 */
import {
  DBLP_ENDPOINT,
  WIKIDATA_ENDPOINT,
  dblpQuery,
  displayNameFor,
  hasSubstance,
  isDblpPerson,
  profileQuery,
  thumbnail,
  wikidataQuery,
  type Facts,
} from './foaf-queries'
import type { Request, Response } from './foaf-worker'

/** How long the pointer has to rest before this is a lookup and not a passing cursor. */
const DWELL_MS = 180
const CACHE_PREFIX = 'foaf-card:v1:'

interface Pending {
  person: string
  displayName: string
  anchor: HTMLAnchorElement
}

const memory = new Map<string, Facts>()
const inFlight = new Map<number, Pending>()
let worker: Worker | undefined
let nextId = 0
let active: Pending | undefined
let dwellTimer: number | undefined
let hideTimer: number | undefined

/**
 * Created once and kept for the life of the page.
 *
 * Re-spawning would repay the bundle's parse cost and the engine's 230 ms of wiring every
 * time, which is the wrong trade for an interaction measured in hundreds of milliseconds.
 * An idle timeout would guarantee that cost on the next hover to save memory nobody is
 * short of.
 */
function ensureWorker(): Worker {
  worker ??= (() => {
    const created = new Worker(new URL('./foaf-worker.ts', import.meta.url), { type: 'module' })
    created.addEventListener('message', (event: MessageEvent<Response>) => onMessage(event.data))
    // A worker that cannot start must not take the page's author links with it.
    created.addEventListener('error', () => {
      hide()
      inFlight.clear()
    })
    return created
  })()
  return worker
}

function cached(person: string): Facts | undefined {
  const held = memory.get(person)
  if (held) return held
  try {
    const stored = sessionStorage.getItem(CACHE_PREFIX + person)
    if (!stored) return undefined
    const facts = JSON.parse(stored) as Facts
    memory.set(person, facts)
    return facts
  } catch {
    // Private windows and blocked site data both throw here. The in-memory map still works.
    return undefined
  }
}

function remember(person: string, facts: Facts): void {
  memory.set(person, facts)
  try {
    sessionStorage.setItem(CACHE_PREFIX + person, JSON.stringify(facts))
  } catch {
    // Full or unavailable storage is not a reason to lose the card.
  }
}

// -- the card -------------------------------------------------------------------------

let card: HTMLElement | undefined
let parts: Record<string, HTMLElement>

function ensureCard(): HTMLElement {
  if (card) return card
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
    engine: pick('.foaf-card-engine'),
    toggle: pick('.foaf-card-toggle'),
    query: pick('.foaf-card-query'),
  }
  // The card stays put while the pointer is on it, so the query can actually be read.
  root.addEventListener('mouseenter', () => window.clearTimeout(hideTimer))
  root.addEventListener('mouseleave', () => scheduleHide())
  parts.toggle.addEventListener('click', () => {
    const shown = parts.query.hidden
    parts.query.hidden = !shown
    parts.toggle.setAttribute('aria-expanded', String(shown))
    parts.toggle.textContent = shown ? 'hide query' : 'show query'
    if (active) place(active.anchor)
  })
  document.body.append(root)
  card = root
  return root
}

function setText(node: HTMLElement, value: string | undefined): void {
  node.textContent = value ?? ''
  node.hidden = !value
}

function render(pending: Pending, facts: Facts | undefined, state: 'loading' | 'ready'): void {
  const root = ensureCard()
  const name = facts ? displayNameFor(facts, pending.displayName) : pending.displayName
  parts.name.textContent = name
  setText(parts.title, facts?.title)
  setText(parts.affiliation, facts?.affiliation ?? facts?.org)
  setText(parts.description, facts?.description)

  const photo = parts.photo as HTMLImageElement
  if (facts?.image) {
    photo.src = thumbnail(facts.image)
    photo.alt = name
    photo.hidden = false
  } else {
    photo.hidden = true
    photo.removeAttribute('src')
  }

  const bare = state === 'ready' && (!facts || !hasSubstance(facts, pending.displayName))
  parts.empty.hidden = !bare
  root.classList.toggle('is-loading', state === 'loading')
  parts.engine.textContent =
    state === 'loading'
      ? 'querying with Comunica…'
      : bare
        ? `Comunica found nothing at ${hostOf(pending.person)}`
        : `queried live with Comunica from ${hostOf(pending.person)}`
  parts.query.textContent = describeQuery(pending)
  root.hidden = false
  place(pending.anchor)
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
  const dereferenced = !isDblpPerson(pending.person)
  const sections: string[] = [
    '# Everything above was queried in your browser by Comunica, just now,',
    '# from the data these sources publish. Nothing is stored on this site.',
  ]
  if (dereferenced) {
    sections.push('', `# Source: ${pending.person}`, profileQuery(pending.person))
  }
  sections.push('', `# Source: ${DBLP_ENDPOINT}`, dblpQuery(pending.person, pending.displayName))
  if (lastWikidataEntity) {
    sections.push('', `# Source: ${WIKIDATA_ENDPOINT}`, wikidataQuery(lastWikidataEntity))
  }
  return sections.join('\n')
}

/** Tracked so the third query is only shown when it actually ran. */
let lastWikidataEntity: string | undefined

function place(anchor: HTMLAnchorElement): void {
  const root = ensureCard()
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
  window.clearTimeout(dwellTimer)
  window.clearTimeout(hideTimer)
  if (active) active.anchor.removeAttribute('aria-describedby')
  active = undefined
  if (!card) return
  card.hidden = true
  parts.query.hidden = true
  parts.toggle.setAttribute('aria-expanded', 'false')
  parts.toggle.textContent = 'show query'
}

function scheduleHide(): void {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hide, 160)
}

// -- what the reader did --------------------------------------------------------------

function onMessage(response: Response): void {
  const pending = inFlight.get(response.id)
  if (!pending) return
  const showing = active?.person === pending.person
  if ('done' in response) {
    inFlight.delete(response.id)
    // Every stage can fail — an offline pod, a 404, an endpoint refusing the query — and
    // then no facts message ever arrived. Without this the card sits on "querying with
    // Comunica…" for as long as the reader keeps pointing at the name.
    if (showing) render(pending, memory.get(pending.person), 'ready')
    return
  }
  if ('failed' in response) return
  remember(pending.person, response.facts)
  // A result for a link the pointer has already left is worth caching, not showing.
  if (!showing) return
  lastWikidataEntity = response.facts.wikidata
  render(pending, response.facts, 'ready')
}

function show(anchor: HTMLAnchorElement): void {
  const person = anchor.getAttribute('resource')
  if (!person) return
  // Whatever asked for this card wins. Without this, a dwell already counting down on a
  // link the mouse happens to rest over replaces the card a keyboard user just opened
  // somewhere else — focus moves, the timer fires 180 ms later, and the card changes person.
  window.clearTimeout(dwellTimer)
  window.clearTimeout(hideTimer)
  const pending: Pending = { person, displayName: (anchor.textContent ?? '').trim(), anchor }
  active = pending
  anchor.setAttribute('aria-describedby', 'foaf-card')

  lastWikidataEntity = undefined
  const known = cached(person)
  if (known) {
    lastWikidataEntity = known.wikidata
    render(pending, known, 'ready')
    return
  }
  render(pending, undefined, 'loading')
  const id = ++nextId
  inFlight.set(id, pending)
  const request: Request = { id, person, displayName: pending.displayName }
  ensureWorker().postMessage(request)
}

/** Each move restarts the countdown, so a pointer sweeping across names loads nothing. */
function onMove(event: MouseEvent): void {
  const anchor = event.currentTarget as HTMLAnchorElement
  if (active?.anchor === anchor) return
  window.clearTimeout(dwellTimer)
  dwellTimer = window.setTimeout(() => show(anchor), DWELL_MS)
}

function authorLink(target: EventTarget | null): HTMLAnchorElement | undefined {
  const element = target instanceof Element ? target.closest('a.author[resource]') : null
  return (element as HTMLAnchorElement) ?? undefined
}

function start(): void {
  if (!document.querySelector('a.author[resource]')) return
  // No hover on a touchscreen, and tapping an author link should follow it, not open a card.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  document.addEventListener('mouseover', (event) => {
    const anchor = authorLink(event.target)
    if (!anchor) return
    window.clearTimeout(hideTimer)
    // Start the worker on arrival but do not query yet: the chunk downloads during the
    // pause that follows instead of after it, which takes the wait off the first hover.
    ensureWorker()
    if (active?.anchor === anchor) return
    // The dwell is armed by movement, not by arrival. Scrolling moves the page under a
    // stationary cursor and Chromium reports that as a mouseover, so arrival alone would
    // open cards nobody pointed at — including over the top of one a keyboard user had
    // just opened elsewhere. Waiting for the pointer to move and then settle is also
    // closer to what hover intent means.
    anchor.addEventListener('mousemove', onMove)
  })

  document.addEventListener('mouseout', (event) => {
    const anchor = authorLink(event.target)
    if (!anchor) return
    anchor.removeEventListener('mousemove', onMove)
    window.clearTimeout(dwellTimer)
    scheduleHide()
  })

  // Keyboard readers get the same card; the author links are already focusable.
  document.addEventListener('focusin', (event) => {
    const anchor = authorLink(event.target)
    if (anchor) show(anchor)
    else if (!card?.contains(event.target as Node)) hide()
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide()
  })

  window.addEventListener('scroll', () => active && place(active.anchor), { passive: true })
  window.addEventListener('resize', () => active && place(active.anchor))
}

start()

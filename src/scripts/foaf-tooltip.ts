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
/**
 * Grace before the card goes, once the pointer is on neither the name nor the card. Wide
 * enough that a pointer travelling through the 8 px gap between them is not caught out.
 */
const HIDE_MS = 120
/**
 * How often a pointer-opened card re-checks that it is still wanted, with no event needed.
 *
 * Every earlier version of this file hung dismissal on receiving some event after the
 * pointer left — mouseout, then mousemove — and each time there was a way for that event
 * not to come. This is the backstop: while a card is up for the pointer, the same check
 * runs on a timer, so the card cannot outlive the reason it opened by more than a tick.
 */
const WATCH_MS = 150
/**
 * One pixel, for one reason: Chrome reports `MouseEvent.clientX` as an integer while the
 * name's rect is fractional, so a pointer on the last pixel of a glyph can read as one
 * pixel outside it. Anything wider is a halo round the name where the card stays although
 * the pointer has visibly left it — at 4 px the randomised sweep found exactly that.
 */
const HIT_SLACK = 1
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
/** The name a dwell is counting down for, or nothing when none is pending. */
let dwellAnchor: HTMLAnchorElement | undefined
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
let watchTimer: number | undefined
/** Whether the query panel is open, kept across the stages that re-render the card. */
let queryOpen = false

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
  parts.toggle.addEventListener('click', () => {
    setQueryOpen(!queryOpen)
    if (active) place(active.anchor)
  })
  document.body.append(root)
  card = root
  return root
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
  setQueryOpen(queryOpen)
  root.hidden = false
  place(pending.anchor)
  // Each stage lands separately and can change the card's size or flip it to the other
  // side of the name. A pointer that was on the card may no longer be; the reverse is
  // never granted here, only by a real move.
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
  const dereferenced = !isDblpPerson(pending.person)
  const sections: string[] = [
    '# Everything above was queried live in your browser by Comunica',
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
  clearDwell()
  cancelHide()
  stopWatch()
  onCard = false
  if (active) active.anchor.removeAttribute('aria-describedby')
  active = undefined
  if (!card) return
  card.hidden = true
  setQueryOpen(false)
}

function armDwell(anchor: HTMLAnchorElement): void {
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
 * Re-decides whether the card belongs on screen. Called on every pointer move, on every
 * re-render, and by the watchdog on a timer, so the decision never depends on any one of
 * those having happened.
 *
 * `mouseover`/`mouseout` are not used at all. They report what crossed the pointer, and
 * Chromium does not reliably dispatch them when the page moves under a still cursor:
 * scrolling 20 px away from a name fires no `mouseout`.
 */
function review(): void {
  if (!active || !openedByPointer) return
  if (held()) cancelHide()
  else scheduleHide()
}

function startWatch(): void {
  stopWatch()
  watchTimer = window.setInterval(review, WATCH_MS)
}

function stopWatch(): void {
  if (watchTimer === undefined) return
  window.clearInterval(watchTimer)
  watchTimer = undefined
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

function show(anchor: HTMLAnchorElement, byPointer: boolean): void {
  const person = anchor.getAttribute('resource')
  if (!person) return
  // Whatever asked for this card wins. Without this, a dwell already counting down on a
  // link the mouse happens to rest over replaces the card a keyboard user just opened
  // somewhere else — focus moves, the timer fires 180 ms later, and the card changes person.
  clearDwell()
  cancelHide()
  openedByPointer = byPointer
  onCard = false
  const pending: Pending = { person, displayName: (anchor.textContent ?? '').trim(), anchor }
  active = pending
  if (byPointer) startWatch()
  else stopWatch()
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
  const anchor = onCard ? undefined : authorLink(event.target)
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

function authorLink(target: EventTarget | null): HTMLAnchorElement | undefined {
  const element = target instanceof Element ? target.closest('a.author[resource]') : null
  return (element as HTMLAnchorElement) ?? undefined
}

function start(): void {
  if (!document.querySelector('a.author[resource]')) return
  // No hover on a touchscreen, and tapping an author link should follow it, not open a card.
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

  document.addEventListener('mousemove', onPointerMove, { passive: true })

  // The pointer is gone — out of the window, or the window is no longer the one in front.
  // There is no position left to check, so a pointer-opened card goes at once. Both the
  // `mouseleave` on the root and the `mouseout` to nowhere are wired because neither is
  // guaranteed on its own across browsers.
  const pointerGone = () => {
    pointer = undefined
    onCard = false
    clearDwell()
    if (openedByPointer) hide()
  }
  document.documentElement.addEventListener('mouseleave', pointerGone)
  document.addEventListener('mouseout', (event) => {
    if (event.relatedTarget === null) pointerGone()
  })
  window.addEventListener('blur', pointerGone)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') pointerGone()
  })

  // Keyboard readers get the same card; the author links are already focusable.
  document.addEventListener('focusin', (event) => {
    const anchor = authorLink(event.target)
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

/**
 * Diagnostics, only with `?foafdebug` in the URL.
 *
 * The card's dismissal has been reported as failing in ways no headless run reproduces.
 * This draws what the code believes, ten times a second, so a report can carry the state
 * the card was in rather than a description of the motion. It costs nothing without the
 * flag: the check below is the only line that runs.
 */
if (/[?&]foafdebug\b/.test(location.search)) {
  const box = document.createElement('pre')
  box.setAttribute('style', 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:8px 10px;font:11px/1.4 monospace;background:#111;color:#0f0;opacity:.92;pointer-events:none;white-space:pre;border-radius:4px')
  document.body.append(box)
  const events: string[] = []
  const note = (name: string) => events.push(`${name}@${(performance.now() / 1000).toFixed(1)}s`) && events.length > 6 && events.shift()
  for (const n of ['mousemove', 'mouseout', 'scroll', 'focusin', 'keydown'] as const) document.addEventListener(n, () => note(n), { passive: true, capture: true })
  document.documentElement.addEventListener('mouseleave', () => note('html.mouseleave'))
  window.addEventListener('blur', () => note('blur'))
  window.setInterval(() => {
    const rects = active ? Array.from(active.anchor.getClientRects()).map((r) => `${r.left | 0}..${r.right | 0}x${r.top | 0}..${r.bottom | 0}`).join(' ') : '-'
    const cb = card && !card.hidden ? card.getBoundingClientRect() : undefined
    box.textContent = [
      `card ${card && !card.hidden ? 'SHOWN' : 'hidden'}  active=${active ? active.displayName : '-'}  byPointer=${openedByPointer}`,
      `pointer=${pointer ? `${pointer.x | 0},${pointer.y | 0}` : '-'}  onAnchor=${pointerOnAnchor()}  onCard=${onCard}  held=${held()}`,
      `hideTimer=${hideTimer !== undefined ? 'pending' : '-'}  dwell=${dwellAnchor ? dwellAnchor.textContent : '-'}  watch=${watchTimer !== undefined ? 'on' : 'off'}`,
      `anchor=${rects}`,
      `cardBox=${cb ? `${cb.left | 0}..${cb.right | 0}x${cb.top | 0}..${cb.bottom | 0}` : '-'}  hover:${card && !card.hidden && card.matches(':hover')}  ua=${navigator.userAgent.replace(/^.*\) /, '').slice(0, 40)}`,
      `events: ${events.join(' ')}`,
    ].join('\n')
  }, 100)
}

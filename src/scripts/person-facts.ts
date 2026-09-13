/**
 * What is known about a person, from the worker or from cache, for the author card and the
 * portraits on the co-author graph.
 *
 * The two features share this so that a portrait fetched for the graph is the same lookup
 * the card would make: hovering a name afterwards answers from memory.
 */
import type { Facts } from './foaf-queries'
import { forget, send } from './worker-client'

const CACHE_PREFIX = 'foaf-card:v1:'

const memory = new Map<string, Facts>()

export function cachedFacts(person: string): Facts | undefined {
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

/** Facts as they arrive; `done` is the last call, with whatever was found, or nothing. */
export type FactsListener = (facts: Facts | undefined, done: boolean) => void

/**
 * Looks a person up, answering from cache when possible.
 *
 * A cached person is answered synchronously and nothing is returned. Otherwise the id of the
 * worker request is returned, so the caller can `forget` it if the reader has moved on.
 */
export function lookupPerson(person: string, displayName: string, listener: FactsListener): number | undefined {
  const known = cachedFacts(person)
  if (known) {
    listener(known, true)
    return undefined
  }
  return send({ kind: 'person', person, displayName }, (response) => {
    if ('done' in response) {
      // Every stage can fail, and then no facts message ever arrived; the listener still
      // has to hear that the lookup is over.
      listener(memory.get(person), true)
    } else if ('facts' in response) {
      remember(person, response.facts)
      listener(response.facts, false)
    }
  })
}

export { forget as forgetLookup }

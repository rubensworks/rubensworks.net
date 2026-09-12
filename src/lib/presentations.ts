import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'

export interface Presentation {
  title: string
  venue: string
  /** Free text, e.g. "8 June 2026" — Liquid parsed it with its `date` filter. */
  date: string
  url: string
  type: string
}

/** `_data/presentations.yml`, in document order — which is the order the page renders. */
export function loadPresentations(path = '_data/presentations.yml'): [string, Presentation][] {
  const raw = parseYaml(readFileSync(path, 'utf8')) as Record<string, Presentation>
  return Object.entries(raw)
}

/**
 * The year out of a presentation's free-text date. Accepts both the `8 June 2026` form the
 * file uses and a leading ISO date, which is the other obvious thing to write. Asserts
 * rather than guessing: a date it cannot read would otherwise drop the entry off the page.
 */
export function presentationYear(id: string, p: Presentation): number {
  const m = /(\d{4})\s*$/.exec(p.date) ?? /^\s*(\d{4})-\d{2}-\d{2}/.exec(p.date)
  if (!m) throw new Error(`Presentation "${id}" has no year in its date: ${p.date}`)
  return Number(m[1])
}

/**
 * Grouped by year, newest first, over a contiguous range covering everything in the file.
 *
 * The range is taken from the data rather than from `new Date()`: a talk scheduled for next
 * year is an ordinary thing to add, and bounding by the build date would drop it off the
 * page with nothing said. It also keeps the build deterministic across New Year.
 */
export function presentationsByYear(
  entries: [string, Presentation][],
): [number, [string, Presentation][]][] {
  const byYear = new Map<number, [string, Presentation][]>()
  for (const entry of entries) {
    const year = presentationYear(entry[0], entry[1])
    byYear.set(year, [...(byYear.get(year) ?? []), entry])
  }
  if (byYear.size === 0) return []
  const years = [...byYear.keys()]
  const out: [number, [string, Presentation][]][] = []
  // Every year in between gets a heading, including any with nothing in it.
  for (let y = Math.max(...years); y >= Math.min(...years); y--) out.push([y, byYear.get(y) ?? []])
  return out
}

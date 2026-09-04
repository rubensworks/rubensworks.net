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
 * `{{ presentation.date | date: "%Y" }}` — the year Liquid extracted from the free-text
 * date. Every entry ends in a four-digit year, and the ids are year-prefixed too, so this
 * asserts rather than guesses.
 */
export function presentationYear(id: string, p: Presentation): number {
  const m = /(\d{4})\s*$/.exec(p.date)
  if (!m) throw new Error(`Presentation "${id}" has no year in its date: ${p.date}`)
  return Number(m[1])
}

/** Grouped by year, newest first — the page renders 2016 up to the current year in reverse. */
export function presentationsByYear(
  entries: [string, Presentation][],
  fromYear: number,
  toYear: number,
): [number, [string, Presentation][]][] {
  const years: number[] = []
  for (let y = toYear; y >= fromYear; y--) years.push(y)
  return years.map((year) => [
    year,
    entries.filter(([id, p]) => presentationYear(id, p) === year),
  ])
}

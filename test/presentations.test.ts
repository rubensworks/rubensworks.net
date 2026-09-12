import { describe, it, expect } from 'vitest'
import { loadPresentations, presentationYear, presentationsByYear } from '../src/lib/presentations'

const entries = loadPresentations()

describe('presentation dates', () => {
  it('reads a year out of every entry in _data/presentations.yml', () => {
    for (const [id, p] of entries) expect(presentationYear(id, p), id).toBeGreaterThan(1990)
  })

  it('accepts both the free-text and ISO date forms', () => {
    const p = { title: '', venue: '', url: '', type: '' }
    expect(presentationYear('x', { ...p, date: '8 June 2026' })).toBe(2026)
    expect(presentationYear('x', { ...p, date: '2027-03-01' })).toBe(2027)
    expect(() => presentationYear('x', { ...p, date: 'next spring' })).toThrow()
  })
})

describe('grouping by year', () => {
  it('covers every entry — nothing is dropped off the page', () => {
    const grouped = presentationsByYear(entries).flatMap(([, ps]) => ps)
    expect(grouped).toHaveLength(entries.length)
  })

  it('runs newest first over a contiguous range', () => {
    const years = presentationsByYear(entries).map(([y]) => y)
    expect(years).toEqual([...years].sort((a, b) => b - a))
    for (let i = 1; i < years.length; i++) expect(years[i]).toBe(years[i - 1]! - 1)
  })

  it('includes a talk scheduled beyond the current year', () => {
    // Bounding the range by `new Date()` used to drop these silently.
    const future = new Date().getFullYear() + 2
    const withFuture: typeof entries = [
      ...entries,
      ['upcoming', { title: 'T', venue: 'V', url: '', type: 'Keynote', date: `1 May ${future}` }],
    ]
    const groups = presentationsByYear(withFuture)
    expect(groups[0]![0]).toBe(future)
    expect(groups.flatMap(([, ps]) => ps)).toHaveLength(withFuture.length)
  })
})

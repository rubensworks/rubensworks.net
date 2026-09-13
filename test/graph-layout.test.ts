import { describe, expect, it } from 'vitest'
import { MAX_RADIUS, PINNED_RADIUS, labelBox, layoutGraph, radiusFor, settleLabels, type LayoutNode, type Placed } from '../src/scripts/graph-layout'

const box = { width: 740, height: 340 }
const distance = (a: Placed, b: Placed) => Math.hypot(a.x - b.x, a.y - b.y)

describe('radiusFor', () => {
  it('grows with the square root of the papers and is capped', () => {
    expect(radiusFor(1)).toBeLessThan(radiusFor(4))
    expect(radiusFor(4)).toBeLessThan(radiusFor(16))
    expect(radiusFor(10000)).toBe(22)
    expect(radiusFor(0)).toBe(radiusFor(1))
  })

  it('makes the pinned node larger than any other can be', () => {
    expect(radiusFor(97, true)).toBe(PINNED_RADIUS)
    expect(PINNED_RADIUS).toBeGreaterThan(MAX_RADIUS)
    expect(radiusFor(10000)).toBeLessThan(radiusFor(1, true))
  })
})

describe('layoutGraph', () => {
  const nodes: LayoutNode[] = [
    { id: 'me', r: 27, pinned: true, labelled: true, label: 'Ruben Taelman' },
    { id: 'a', r: 12, labelled: true, label: 'Ruben Verborgh' },
    { id: 'b', r: 12, labelled: true, label: 'Pieter Colpaert' },
    { id: 'c', r: 8 },
    { id: 'd', r: 8 },
  ]
  const edges = [
    { a: 'me', b: 'a', n: 50 },
    { a: 'me', b: 'b', n: 17 },
    { a: 'me', b: 'c', n: 1 },
    { a: 'me', b: 'd', n: 1 },
    { a: 'a', b: 'b', n: 10 },
  ]

  it('keeps every circle inside the box', () => {
    for (const n of layoutGraph(nodes, edges, box)) {
      expect(n.x - n.r).toBeGreaterThanOrEqual(0)
      expect(n.x + n.r).toBeLessThanOrEqual(box.width)
      expect(n.y - n.r).toBeGreaterThanOrEqual(0)
      expect(n.y + n.r).toBeLessThanOrEqual(box.height)
    }
  })

  it('puts frequent co-authors nearer the centre than occasional ones', () => {
    const placed = new Map(layoutGraph(nodes, edges, box).map((n) => [n.id, n]))
    const me = placed.get('me')!
    expect(distance(me, placed.get('a')!)).toBeLessThan(distance(me, placed.get('c')!))
    expect(distance(me, placed.get('b')!)).toBeLessThan(distance(me, placed.get('d')!))
  })

  it('keeps the pinned node at the exact centre of the canvas', () => {
    const me = layoutGraph(nodes, edges, box).find((n) => n.pinned)!
    expect(me.x).toBe(box.width / 2)
    expect(me.y).toBe(box.height / 2)
  })

  it('centres a drawing without a pinned node on its bounding box', () => {
    const free = nodes.map(({ pinned: _pinned, ...n }) => n)
    const placed = layoutGraph(free, edges, box)
    // Extents include the radii; only x is checked, since label settling nudges y afterwards.
    const left = Math.min(...placed.map((n) => n.x - n.r))
    const right = Math.max(...placed.map((n) => n.x + n.r))
    expect((left + right) / 2).toBeCloseTo(box.width / 2, 0)
  })

  it('is deterministic', () => {
    expect(layoutGraph(nodes, edges, box)).toEqual(layoutGraph(nodes, edges, box))
  })

  it('points labels away from the centre', () => {
    const placed = layoutGraph(nodes, edges, box)
    const me = placed.find((n) => n.pinned)!
    for (const n of placed) {
      if (!n.pinned) expect(n.left).toBe(n.x < me.x)
    }
  })

  it('never overlaps two labels', () => {
    const placed = layoutGraph(nodes, edges, box)
    const labelled = placed.filter((n) => n.labelled)
    for (const a of labelled) {
      for (const b of labelled) {
        if (a === b) continue
        const A = labelBox(a)
        const B = labelBox(b)
        const apart = A.x1 >= B.x2 || B.x1 >= A.x2 || A.y1 >= B.y2 || B.y1 >= A.y2
        expect(apart).toBe(true)
      }
    }
  })

  it('ignores edges to unknown nodes and survives an empty graph', () => {
    expect(layoutGraph([], [], box)).toEqual([])
    expect(layoutGraph(nodes, [{ a: 'me', b: 'nobody', n: 1 }], box)).toHaveLength(nodes.length)
  })
})

describe('settleLabels', () => {
  it('pushes two labelled nodes on the same line apart and leaves the pinned one', () => {
    const nodes: Placed[] = [
      { id: 'me', r: 17, pinned: true, labelled: true, label: 'Me', x: 370, y: 170, left: false },
      { id: 'a', r: 10, labelled: true, label: 'Alice Anderson', x: 500, y: 100, left: false },
      { id: 'b', r: 10, labelled: true, label: 'Bob Brown', x: 505, y: 104, left: false },
    ]
    settleLabels(nodes, 340)
    expect(nodes[0]!.y).toBe(170)
    expect(Math.abs(nodes[1]!.y - nodes[2]!.y)).toBeGreaterThanOrEqual(14)
  })
})

/**
 * A small force layout for the co-author graph, and the label placement on top of it.
 *
 * Hand-rolled rather than d3: the graph has under a hundred nodes, so 400 synchronous ticks
 * settle in well under 50 ms, and a layout library would be the largest thing on the page
 * after Comunica itself. Deterministic on purpose: the same graph always gives the same
 * picture, which is also what makes it testable.
 */

export interface LayoutNode {
  id: string
  r: number
  /** Held at the centre; everyone else arranges around it. */
  pinned?: boolean
  /** Whether the name is drawn, which is what label placement has to keep apart. */
  labelled?: boolean
  label?: string
}

export interface LayoutEdge {
  a: string
  b: string
  /** Shared papers; heavier pairs pull closer. */
  n: number
}

export interface Placed extends LayoutNode {
  x: number
  y: number
  /** The label goes on the left of the circle, pointing away from the centre. */
  left: boolean
}

export interface LayoutOptions {
  width: number
  height: number
  ticks?: number
  /** Width of one label character, for the overlap pass; 6.1 fits 11px Open Sans. */
  charWidth?: number
}

interface Body extends Placed {
  vx: number
  vy: number
  links: Array<{ other: Body; n: number; toPinned: boolean }>
}

/** Radius from papers together: a square-root scale, so a 56-paper node does not swallow the drawing. */
export function radiusFor(papers: number, pinned = false): number {
  if (pinned) return 17
  return Math.min(22, 5 + 2.6 * Math.sqrt(Math.max(papers, 1)))
}

/**
 * Positions every node inside the box.
 *
 * Forces: pairwise repulsion, springs on edges whose rest length shortens with shared
 * papers, and a pull to the centre that is weaker sideways than vertically so the graph
 * fills a wide, short canvas. The pinned node never moves. Afterwards the drawing is centred
 * on its own bounding box, since the pinned node is rarely its visual centre, and labelled
 * nodes are nudged apart until no label covers another label or a circle.
 */
export function layoutGraph(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], options: LayoutOptions): Placed[] {
  const { width: W, height: H } = options
  const ticks = options.ticks ?? 400
  const bodies: Body[] = nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2
    const distance = 70 + 90 / Math.sqrt(Math.max(n.r, 1))
    return {
      ...n,
      x: n.pinned ? W / 2 : W / 2 + Math.cos(angle) * distance,
      y: n.pinned ? H / 2 : H / 2 + Math.sin(angle) * distance,
      vx: 0,
      vy: 0,
      left: false,
      links: [],
    }
  })
  const byId = new Map(bodies.map((b) => [b.id, b]))
  const springs: Array<{ a: Body; b: Body; n: number; toPinned: boolean }> = []
  for (const e of edges) {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b || a === b) continue
    const spring = { a, b, n: e.n, toPinned: Boolean(a.pinned || b.pinned) }
    springs.push(spring)
    a.links.push({ other: b, n: e.n, toPinned: spring.toPinned })
    b.links.push({ other: a, n: e.n, toPinned: spring.toPinned })
  }

  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1) {
          // Coincident nodes get a deterministic nudge instead of a random one.
          dx = ((i + j) % 2 ? 1 : -1) * 0.5
          dy = (j % 2 ? 1 : -1) * 0.5
          d2 = 0.5
        }
        const d = Math.sqrt(d2)
        let f = (1600 * (1 + (a.r + b.r) / 20)) / d2
        const min = a.r + b.r + 6
        if (d < min) f += (min - d) * 0.5
        a.vx -= (dx / d) * f
        a.vy -= (dy / d) * f
        b.vx += (dx / d) * f
        b.vy += (dy / d) * f
      }
    }
    for (const s of springs) {
      const dx = s.b.x - s.a.x
      const dy = s.b.y - s.a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      // Frequent co-authors sit nearer the centre; pairs among them pull gently.
      const rest = s.toPinned ? s.a.r + s.b.r + 40 + 150 / Math.sqrt(s.n) : s.a.r + s.b.r + 56
      const f = (d - rest) * 0.012 * Math.min(s.n, 3)
      s.a.vx += (dx / d) * f
      s.a.vy += (dy / d) * f
      s.b.vx -= (dx / d) * f
      s.b.vy -= (dy / d) * f
    }
    for (const b of bodies) {
      if (b.pinned) {
        b.vx = b.vy = 0
        continue
      }
      b.vx += (W / 2 - b.x) * 0.0015
      b.vy += (H / 2 - b.y) * 0.008
      b.vx *= 0.6
      b.vy *= 0.6
      b.x = clamp(b.x + b.vx, b.r + 2, W - b.r - 2)
      b.y = clamp(b.y + b.vy, b.r + 2, H - b.r - 2)
    }
  }

  centre(bodies, W, H)
  const pinned = bodies.find((b) => b.pinned)
  const middle = pinned ? pinned.x : W / 2
  for (const b of bodies) b.left = !b.pinned && b.x < middle
  settleLabels(bodies, H, options.charWidth ?? 6.1)
  return bodies.map(({ vx: _vx, vy: _vy, links: _links, ...placed }) => placed)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function centre(bodies: Body[], W: number, H: number): void {
  if (!bodies.length) return
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const b of bodies) {
    minX = Math.min(minX, b.x - b.r)
    maxX = Math.max(maxX, b.x + b.r)
    minY = Math.min(minY, b.y - b.r)
    maxY = Math.max(maxY, b.y + b.r)
  }
  const dx = W / 2 - (minX + maxX) / 2
  const dy = H / 2 - (minY + maxY) / 2
  for (const b of bodies) {
    b.x += dx
    b.y += dy
  }
}

interface Box {
  x1: number
  x2: number
  y1: number
  y2: number
}

/** Where the label of a placed node is drawn, in canvas units. */
export function labelBox(n: Placed, charWidth = 6.1): Box {
  const w = (n.label ?? n.id).length * charWidth
  if (n.pinned) return { x1: n.x - w / 2, x2: n.x + w / 2, y1: n.y + n.r + 4, y2: n.y + n.r + 18 }
  return n.left
    ? { x1: n.x - n.r - 3 - w, x2: n.x - n.r - 3, y1: n.y - 7, y2: n.y + 7 }
    : { x1: n.x + n.r + 3, x2: n.x + n.r + 3 + w, y1: n.y - 7, y2: n.y + 7 }
}

const circleBox = (n: Placed): Box => ({ x1: n.x - n.r, x2: n.x + n.r, y1: n.y - n.r, y2: n.y + n.r })
const apart = (A: Box, B: Box): boolean => A.x1 >= B.x2 || B.x1 >= A.x2 || A.y1 >= B.y2 || B.y1 >= A.y2

/**
 * Nudges labelled nodes apart vertically until no label box meets another label or any
 * circle. Cheap, bounded, and enough for a graph this size; it moves circles a few pixels,
 * never the pinned one.
 */
export function settleLabels(nodes: Placed[], height: number, charWidth = 6.1): void {
  const labelled = nodes.filter((n) => n.labelled || n.pinned)
  for (let pass = 0; pass < 60; pass++) {
    let moved = false
    for (const a of labelled) {
      for (const b of nodes) {
        if (a === b) continue
        const A = labelBox(a, charWidth)
        const other = b.labelled || b.pinned ? labelBox(b, charWidth) : circleBox(b)
        const B = apart(A, other) ? circleBox(b) : other
        if (apart(A, B)) continue
        const push = (Math.min(A.y2, B.y2) - Math.max(A.y1, B.y1)) / 2 + 1
        const up = a.y <= b.y ? a : b
        const down = up === a ? b : a
        if (!up.pinned) up.y = Math.max(up.r + 2, up.y - push)
        if (!down.pinned) down.y = Math.min(height - down.r - 2, down.y + push)
        moved = true
      }
    }
    if (!moved) return
  }
}

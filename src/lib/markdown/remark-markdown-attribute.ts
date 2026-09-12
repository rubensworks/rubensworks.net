import type { Root, RootContent, Paragraph, Html, Parent } from 'mdast'
import { protectBlankLines } from './html-blocks'

/**
 * kramdown's `markdown="…"` attribute on raw HTML. CommonMark passes raw HTML through
 * untouched, so without this the Markdown inside ships literally — and only partly, since an
 * HTML block ends at the first blank line, leaving output that looks mostly right with stray
 * `**` in it. The attribute itself is removed either way.
 *
 *   markdown="1"     on <p>                    -> span-level: inline Markdown, no wrapper
 *   markdown="block" on <figure>, <figcaption> -> block-level: full Markdown, incl. fences
 *
 * Block mode rewrites the *source* before parsing, inserting blank lines inside the tags.
 * Repairing the parsed tree instead cannot work: fenced listings contain blank lines, so
 * CommonMark pairs the ``` of one figure with the ``` of the next and the tree a plugin sees
 * is already scrambled. Span mode has to produce one element with inline content, which the
 * blank-line trick cannot express, so it runs on the tree — and `<p>` never holds fences.
 */

const OPEN_TAG_SOURCE =
  /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*\bmarkdown\s*=\s*(["'])(1|block|span)\3[^>]*)>/

/** kramdown's HTML_CONTENT_MODEL: elements whose `markdown="1"` means span-level. */
const SPAN_CONTENT_MODEL = new Set(['p', 'dt', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'td', 'th', 'li'])

interface Attr { name: string; value: string }

function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    attrs.push({ name: m[1]!, value: m[2] ?? m[3] ?? m[4] ?? '' })
  }
  return attrs
}

const renderAttrs = (attrs: Attr[]) =>
  attrs.map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join('')

const isSpanMode = (tag: string, value: string) =>
  value === 'span' || (value === '1' && SPAN_CONTENT_MODEL.has(tag))

/** Finds the index just past the `>` of the tag starting at `from`. */
function endOfTag(source: string, from: number): number {
  const gt = source.indexOf('>', from)
  if (gt < 0) throw new Error('Unterminated HTML tag in markdown="…" block')
  return gt + 1
}

/** Finds the offset of the `</tag>` matching a tag already opened before `searchFrom`. */
function findCloseTag(source: string, tag: string, searchFrom: number): number {
  const re = new RegExp(`<(/?)${tag}\\b`, 'gi')
  re.lastIndex = searchFrom
  let depth = 1
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (m[1] === '/') {
      depth--
      if (depth === 0) return m.index
    } else if (!/\/>\s*$/.test(source.slice(m.index, source.indexOf('>', m.index) + 1))) {
      depth++
    }
  }
  throw new Error(`No closing </${tag}> for a markdown="…" block`)
}

/**
 * The ranges covered by fenced code blocks. The rewrite runs on raw source, so without this
 * a fenced sample *showing* `<div markdown="1">` would be rewritten and its content parsed.
 * Indented code blocks need no such guard: a four-space indent misses the tag regex anyway.
 */
export function fencedRanges(source: string): [number, number][] {
  const ranges: [number, number][] = []
  let offset = 0
  let open: { char: string; len: number; start: number } | null = null
  for (const line of source.split('\n')) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (m) {
      const char = m[1]![0]!
      const len = m[1]!.length
      if (!open) open = { char, len, start: offset }
      else if (char === open.char && len >= open.len && m[2]!.trim() === '') {
        ranges.push([open.start, offset + line.length])
        open = null
      }
    }
    offset += line.length + 1
  }
  // An unterminated fence runs to the end of the document, as CommonMark says.
  if (open) ranges.push([open.start, source.length])
  return ranges
}

const inRanges = (ranges: [number, number][], at: number) =>
  ranges.some(([a, b]) => at >= a && at < b)

/**
 * Surrounds every block-mode element's content with blank lines and strips the attribute,
 * so CommonMark parses the content as Markdown. Nested elements are reached by re-scanning
 * from just after each rewritten opening tag.
 */
export function rewriteBlockElements(source: string): string {
  let out = source
  let from = 0
  for (;;) {
    OPEN_TAG_SOURCE.lastIndex = 0
    const m = OPEN_TAG_SOURCE.exec(out.slice(from))
    if (!m) return out

    const openStart = from + m.index
    const tag = m[1]!.toLowerCase()
    // Recomputed each pass: the rewrite shifts every offset after the element it expands.
    if (inRanges(fencedRanges(out), openStart)) {
      from = endOfTag(out, openStart)
      continue
    }
    if (isSpanMode(tag, m[4]!)) {
      // Left for the tree pass; skip past this opening tag and keep scanning.
      from = endOfTag(out, openStart)
      continue
    }

    const openEnd = endOfTag(out, openStart)
    const closeStart = findCloseTag(out, tag, openEnd)
    const closeEnd = endOfTag(out, closeStart)

    const attrs = parseAttrs(m[2]!).filter((a) => a.name.toLowerCase() !== 'markdown')
    const openTag = `<${tag}${renderAttrs(attrs)}>`
    const inner = out.slice(openEnd, closeStart)
    const closeTag = out.slice(closeStart, closeEnd)

    const rewritten = `${openTag}\n\n${inner.replace(/^\n+/, '').replace(/\n+$/, '')}\n\n${closeTag}`
    out = out.slice(0, openStart) + rewritten + out.slice(closeEnd)
    from = openStart + openTag.length
  }
}

export function remarkMarkdownAttribute(this: any) {
  const self = this

  /** Span mode, on the tree: one element whose content is inline Markdown. */
  const applySpanMode = (tree: Root, source: string) => {
    const walk = (parent: Parent) => {
      for (let i = 0; i < parent.children.length; i++) {
        const node = parent.children[i]!
        if (node.type !== 'html') {
          if ('children' in node) walk(node as Parent)
          continue
        }
        const match = OPEN_TAG_SOURCE.exec((node as Html).value)
        if (!match) continue
        const tag = match[1]!.toLowerCase()
        if (!isSpanMode(tag, match[4]!)) continue

        const attrs = parseAttrs(match[2]!).filter((a) => a.name.toLowerCase() !== 'markdown')
        const nodeStart = node.position!.start.offset!
        const openStart = nodeStart + (node as Html).value.indexOf(match[0])
        const openEnd = endOfTag(source, openStart)
        const closeStart = findCloseTag(source, tag, openEnd)
        const closeEnd = endOfTag(source, closeStart)

        const inner = source.slice(openEnd, closeStart)
        const parsed = self.parse(inner) as Root

        // CommonMark will have split the inner text into several blocks — an HTML comment
        // alone on a line does it, as in the 2026 post's `<!-- Need -->`. They are flattened
        // back into one inline sequence, with the source text between them restored verbatim
        // so the original line breaks survive.
        const inlineChildren: any[] = []
        let pos = 0
        for (const block of parsed.children) {
          const start = block.position!.start.offset!
          if (start > pos) inlineChildren.push({ type: 'text', value: inner.slice(pos, start) })
          if (block.type === 'paragraph') inlineChildren.push(...(block as Paragraph).children)
          else if (block.type === 'html') inlineChildren.push({ type: 'html', value: block.value })
          else {
            throw new Error(
              `<${tag} markdown="${match[4]}"> contains a ${block.type}, which kramdown would ` +
                `not have parsed at span level`,
            )
          }
          pos = block.position!.end.offset!
        }
        if (pos < inner.length) inlineChildren.push({ type: 'text', value: inner.slice(pos) })

        const replacement: RootContent[] = [
          {
            type: 'paragraph',
            children: inlineChildren,
            data: {
              hName: tag,
              hProperties: Object.fromEntries(attrs.map((a) => [a.name, a.value])),
            },
          } as Paragraph,
        ]

        // The raw HTML block can hold more than the element itself — every post has
        // `<!--more-->` on the line straight after `</p>`, with no blank line between.
        const nodeEnd = node.position!.end.offset!
        const before = source.slice(nodeStart, openStart)
        const after = closeEnd < nodeEnd ? source.slice(closeEnd, nodeEnd) : ''
        if (before.trim()) replacement.unshift({ type: 'html', value: before.trimEnd() })
        if (after.trim()) replacement.push(...(self.parse(after) as Root).children)

        let end = i + 1
        while (end < parent.children.length) {
          const start = parent.children[end]!.position?.start.offset
          if (start === undefined || start >= closeEnd) break
          end++
        }
        parent.children.splice(i, end - i, ...replacement)
        i += replacement.length - 1
      }
    }
    walk(tree)
  }

  return (tree: Root, file: { value: string }) => {
    // Blank lines inside a plain raw HTML block are neutralised first, so CommonMark keeps
    // the block open to its closing tag the way kramdown does. See html-blocks.ts.
    const source = protectBlankLines(String(file.value))
    const rewritten = rewriteBlockElements(source)
    // Nothing may survive the rewrite: a leftover markdown="block" means the element was
    // never expanded, and its Markdown would ship literally.
    const leftoverRe = /<[a-zA-Z][^>]*\bmarkdown\s*=\s*(["'])(block|span)\1/g
    const fenced = fencedRanges(rewritten)
    let leftover: RegExpExecArray | null = null
    for (let hit = leftoverRe.exec(rewritten); hit; hit = leftoverRe.exec(rewritten)) {
      // A fenced sample showing the attribute is content, not something to expand.
      if (!inRanges(fenced, hit.index)) {
        leftover = hit
        break
      }
    }
    if (leftover) {
      const at = leftover.index
      throw new Error(
        `markdown="${leftover[2]}" survived the block rewrite at offset ${at}: ` +
          JSON.stringify(rewritten.slice(Math.max(0, at - 120), at + 120)),
      )
    }
    if (rewritten !== String(file.value)) {
      // Re-parse from the rewritten source so positions and content stay consistent.
      const reparsed = self.parse(rewritten) as Root
      tree.children = reparsed.children
      applySpanMode(tree, rewritten)
    } else {
      applySpanMode(tree, source)
    }
  }
}

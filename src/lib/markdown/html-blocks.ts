/**
 * kramdown ends a raw HTML block at its matching close tag; CommonMark ends it at the first
 * blank line.
 *
 * `reading_list.md` depends on the difference. Each of its 28 books expands to
 *
 *     <p class="description">
 *       ⏎
 *     ␉   These personal notes of Roman emperor Marcus Aurelius …
 *
 * because the description value starts with a newline, leaving a line of nothing but
 * spaces. CommonMark reads that as blank, closes the `<div class="books">` block there, and
 * then reads the tab-indented prose that follows as an indented *code block* — so every
 * book's description falls out of its `<p>` and renders as source code.
 *
 * The fix keeps the content byte-identical: whitespace-only lines inside such an element
 * are given a private-use marker so CommonMark does not see them as blank, and the marker is
 * removed again after rendering. Elements carrying `markdown="…"` are skipped — those are
 * meant to be reparsed, and `remark-markdown-attribute.ts` handles them.
 */

export const BLANK_LINE_MARKER = ''

/** Tags whose raw HTML kramdown passes through as a block. */
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl', 'fieldset', 'figcaption',
  'figure', 'footer', 'form', 'header', 'hr', 'main', 'nav', 'ol', 'p', 'pre', 'section',
  'table', 'ul',
])

const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*)>/g

function findCloseTag(source: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${tag}\\b`, 'gi')
  re.lastIndex = from
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
  return -1
}

export function protectBlankLines(source: string): string {
  let out = ''
  let pos = 0
  OPEN_TAG.lastIndex = 0
  let m: RegExpExecArray | null

  while ((m = OPEN_TAG.exec(source)) !== null) {
    if (m.index < pos) continue
    const tag = m[1]!.toLowerCase()
    if (!BLOCK_TAGS.has(tag)) continue
    if (/\bmarkdown\s*=/.test(m[2]!)) continue
    // Only a tag that starts its own line opens an HTML block.
    const lineStart = source.lastIndexOf('\n', m.index) + 1
    if (source.slice(lineStart, m.index).trim() !== '') continue

    const closeStart = findCloseTag(source, tag, m.index + m[0].length)
    if (closeStart < 0) continue
    const closeEnd = source.indexOf('>', closeStart) + 1

    out += source.slice(pos, m.index)
    out += source
      .slice(m.index, closeEnd)
      .replace(/^[ \t]*$/gm, (ws) => ws + BLANK_LINE_MARKER)
    pos = closeEnd
    OPEN_TAG.lastIndex = closeEnd
  }

  return out + source.slice(pos)
}

/** Removes the markers again; they must never reach a visitor. */
export const stripBlankLineMarkers = (html: string): string =>
  html.split(BLANK_LINE_MARKER).join('')

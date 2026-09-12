import type { Root, RootContent, Paragraph, Html } from 'mdast'

/**
 * CommonMark's "HTML block type 7" accepts any tag name, so a raw block opening with a
 * span-level tag is passed through with no wrapper. kramdown starts an ordinary paragraph
 * instead, emitting `<p><span …>…</span></p>`. The `<p>` is not cosmetic: `_base.scss` gives
 * it a bottom margin, without which the address block on /contact/ loses its spacing.
 *
 * So: a block-level `html` node whose first tag is span-level gets wrapped in a paragraph.
 */

// kramdown's HTML_SPAN_ELEMENTS (kramdown/parser/html.rb).
const SPAN_LEVEL = new Set([
  'a', 'abbr', 'acronym', 'b', 'bdo', 'big', 'br', 'button', 'cite', 'code', 'dfn', 'em',
  'i', 'img', 'input', 'kbd', 'label', 'map', 'q', 'samp', 'select', 'small', 'span',
  'strong', 'sub', 'sup', 'textarea', 'tt', 'var',
])

const firstTag = (value: string): string | null => {
  const m = value.match(/^\s*<\s*([a-zA-Z][a-zA-Z0-9-]*)/)
  return m ? m[1]!.toLowerCase() : null
}

// Containers whose children are *blocks*. Inline raw HTML is also an mdast `html` node, so
// descending into phrasing content would wrap every inline <a> in a paragraph.
const BLOCK_PARENTS = new Set(['root', 'blockquote', 'listItem', 'footnoteDefinition'])

export function remarkInlineHtmlParagraph() {
  return (tree: Root) => {
    const visit = (parent: RootContent | Root) => {
      const children = (parent as { children?: RootContent[] }).children
      if (!children) return
      const isBlockParent = BLOCK_PARENTS.has(parent.type)
      for (let i = 0; i < children.length; i++) {
        const node = children[i]!
        if (isBlockParent && node.type === 'html') {
          const tag = firstTag((node as Html).value)
          if (tag && SPAN_LEVEL.has(tag)) {
            const paragraph: Paragraph = { type: 'paragraph', children: [node as any] }
            children[i] = paragraph as RootContent
            continue
          }
        }
        visit(node)
      }
    }
    visit(tree)
  }
}

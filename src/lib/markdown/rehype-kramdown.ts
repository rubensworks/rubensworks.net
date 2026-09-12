import type { Root, Element, Parent } from 'hast'
import { BLANK_LINE_MARKER, stripBlankLineMarkers } from './html-blocks'

/**
 * The small kramdown output conventions that remark does not share.
 *
 * 1. Inline code outside a highlighted block gets `class="highlighter-rouge"`.
 *
 * 2. Heading IDs: strip everything but letters, digits, spaces and hyphens; spaces to
 *    hyphens; downcase; `section` if empty. So digits are *kept* (`## 1. Have a clear goal`
 *    -> `1-have-a-clear-goal`, where github-slugger would drop the number) and existing
 *    hyphens survive (`JSON-LD` -> `json-ld`). Duplicates get `-1`, `-2`, … from the second
 *    use onwards.
 */

/** kramdown 1.x's `generate_id`. */
export function kramdownSlug(text: string): string {
  const gen = text
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .replace(/ /g, '-')
    .toLowerCase()
  return gen.length === 0 ? 'section' : gen
}

const textOf = (node: any): string =>
  node.type === 'text'
    ? node.value
    : (node.children ?? []).map(textOf).join('')

export function rehypeKramdown() {
  return (tree: Root) => {
    const seen = new Map<string, number>()

    // Drop the markers html-blocks.ts used to keep raw HTML blocks open.
    const unmark = (node: any) => {
      if (typeof node.value === 'string' && node.value.includes(BLANK_LINE_MARKER)) {
        node.value = stripBlankLineMarkers(node.value)
      }
      for (const c of node.children ?? []) unmark(c)
    }
    unmark(tree)

    /**
     * hast reads `datatype` as the `data-*` property `dataType` and writes it back as
     * `data-type`, rewriting the RDFa on every `schema:datePublished` in /cv/'s bibliography
     * blocks. Renamed back on the way out.
     */
    const fixDatatype = (node: any) => {
      if (node.properties && 'dataType' in node.properties) {
        const value = node.properties.dataType
        delete node.properties.dataType
        node.properties.datatype = value
      }
      for (const c of node.children ?? []) fixDatatype(c)
    }
    fixDatatype(tree)

    const visit = (node: Parent, parent: Parent | null) => {
      for (const child of node.children ?? []) {
        if (child.type !== 'element') continue
        const el = child as Element

        if (el.tagName === 'code') {
          // Inside <pre> the block is highlighted, and those are left alone.
          const inPre = (node as Element).tagName === 'pre'
          if (!inPre) {
            const existing = el.properties?.className
            if (existing === undefined) {
              el.properties = { ...el.properties, className: ['highlighter-rouge'] }
            }
          }
        }

        if (/^h[1-6]$/.test(el.tagName)) {
          // Unconditional: remark-rehype has already assigned a github-slugger id, and that
          // is the value being replaced. No heading carries an explicit IAL id —
          // remarkAttributeLists throws if one ever does — so nothing hand-written is lost.
          const base = kramdownSlug(textOf(el))
          const n = seen.get(base) ?? 0
          seen.set(base, n + 1)
          el.properties = { ...el.properties, id: n === 0 ? base : `${base}-${n}` }
        }

        visit(el as unknown as Parent, node)
      }
    }

    visit(tree as unknown as Parent, null)
  }
}

import type { Root, Element, Parent } from 'hast'

/**
 * The small kramdown output conventions that remark does not share.
 *
 * 1. Inline code gets `class="highlighter-rouge"`. kramdown adds it to every `<code>` that
 *    is not inside a highlighted block; the site's `_base.scss` styles `code` regardless,
 *    but the class is part of the published markup on every page that mentions a symbol.
 *
 * 2. Heading IDs. Reproduced from kramdown 1.x's `generate_id`
 *    (`kramdown/converter/base.rb`), which Jekyll 3.8.7 pins:
 *
 *      gen_id = str.gsub(/[^a-zA-Z0-9 -]/, '')  # drop everything else, keep hyphens
 *      gen_id.tr!(' ', '-')
 *      gen_id.downcase!
 *      gen_id = 'section' if gen_id.empty?
 *
 *    Two consequences worth naming, both confirmed against the golden site: digits are
 *    *kept*, so `## 1. Have a clear goal…` yields `1-have-a-clear-goal…` (github-slugger
 *    would drop the leading number), and existing hyphens survive, so `JSON-LD` yields
 *    `json-ld`. Duplicate slugs get `-1`, `-2`, … appended, counting from the second use.
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

    const visit = (node: Parent, parent: Parent | null) => {
      for (const child of node.children ?? []) {
        if (child.type !== 'element') continue
        const el = child as Element

        if (el.tagName === 'code') {
          // Inside <pre> the block is highlighted, and kramdown leaves those alone.
          const inPre = (node as Element).tagName === 'pre'
          if (!inPre) {
            const existing = el.properties?.className
            if (existing === undefined) {
              el.properties = { ...el.properties, className: ['highlighter-rouge'] }
            }
          }
        }

        if (/^h[1-6]$/.test(el.tagName)) {
          // Overwritten unconditionally: remark-rehype has already assigned a
          // github-slugger id by this point, and that is exactly the value that has to go.
          // No heading in the content carries an explicit IAL id — remarkAttributeLists
          // throws if one ever does, so this cannot silently discard an author's id.
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

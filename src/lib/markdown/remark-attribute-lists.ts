import type { Root, RootContent, Parent, Paragraph, Text } from 'mdast'
import { IAL_META_PREFIX } from './shiki-rouge-wrapper'

/**
 * kramdown block-level inline attribute lists — 7 occurrences.
 *
 * A line of the form `{:.cv-listing}` or `{:#demo-nodejs-preamble .hide}` on its own,
 * directly after a block, applies those attributes to that block. remark has no such
 * syntax, so without this the braces render as literal text in the paragraph.
 *
 * Used by:
 *   cv.md                          {:.cv-biography}, {:.cv-listing} x3
 *   2019-03-13-streaming-rdf-parsers  {:#demo-nodejs-preamble .hide}, {:.demo-nodejs} x2
 *
 * Only the block-level form is implemented — that is all the content uses — and anything
 * else throws rather than being silently dropped.
 */

const IAL_LINE = /^\{:([^}]*)\}$/

interface Parsed { id?: string; classes: string[]; attrs: Record<string, string> }

export function parseIal(body: string): Parsed {
  const out: Parsed = { classes: [], attrs: {} }
  const re = /(?:^|\s)(?:#([^\s.#=]+)|\.([^\s.#=]+)|([a-zA-Z_:][-\w:.]*)=(?:"([^"]*)"|'([^']*)'|(\S+)))/g
  let m: RegExpExecArray | null
  let consumed = 0
  while ((m = re.exec(body)) !== null) {
    consumed = re.lastIndex
    if (m[1]) out.id = m[1]
    else if (m[2]) out.classes.push(m[2])
    else if (m[3]) out.attrs[m[3]] = m[4] ?? m[5] ?? m[6] ?? ''
  }
  if (body.trim() && consumed < body.trimEnd().length) {
    throw new Error(`Unsupported kramdown attribute list: {:${body}}`)
  }
  return out
}

export function remarkAttributeLists() {
  return (tree: Root) => {
    const walk = (parent: Parent) => {
      for (let i = parent.children.length - 1; i >= 0; i--) {
        const node = parent.children[i]!
        if ('children' in node && node.type !== 'paragraph') walk(node as Parent)

        // A lone IAL becomes a paragraph containing exactly one text node.
        if (node.type !== 'paragraph') continue
        const p = node as Paragraph
        if (p.children.length !== 1 || p.children[0]!.type !== 'text') continue
        const m = IAL_LINE.exec((p.children[0] as Text).value.trim())
        if (!m) continue

        const target = parent.children[i - 1]
        if (!target) throw new Error(`Attribute list {:${m[1]}} has no preceding block`)

        const parsed = parseIal(m[1]!)
        if (parsed.id && /^heading$/.test(target.type)) {
          throw new Error(
            `Attribute list {:${m[1]}} sets an id on a heading, which rehype-kramdown would ` +
              `overwrite with the auto-generated slug`,
          )
        }
        // A code fence is rebuilt from scratch by Shiki, which drops hProperties. Its IAL
        // rides along in the fence's `meta` string instead; shiki-rouge-wrapper.ts picks it
        // back up. See rehype-rouge-blocks.ts for where it finally lands.
        if (target.type === 'code') {
          const payload = JSON.stringify({ id: parsed.id, classes: parsed.classes })
          const code = target as RootContent & { meta?: string | null }
          code.meta = `${code.meta ? `${code.meta} ` : ''}${IAL_META_PREFIX}${payload}`
          parent.children.splice(i, 1)
          continue
        }

        const data = ((target as RootContent & { data?: any }).data ??= {})
        const props = (data.hProperties ??= {})
        if (parsed.id) props.id = parsed.id
        if (parsed.classes.length) {
          props.className = [...toArray(props.className), ...parsed.classes]
        }
        Object.assign(props, parsed.attrs)

        parent.children.splice(i, 1)
      }
    }
    walk(tree)
  }
}

const toArray = (v: unknown): string[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/\s+/)

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

        // A trailing IAL under a list has no blank line before it, so CommonMark folds it
        // into the last item as a lazy continuation instead of leaving it as its own
        // paragraph. cv.md's three `{:.cv-listing}` markers all look like this.
        if (node.type === 'list') {
          const text = lastText(node as Parent)
          const m = text && /\n\{:([^}]*)\}\s*$/.exec(text.value)
          if (text && m) {
            applyIal(node, parseIal(m[1]!))
            text.value = text.value.slice(0, m.index)
          }
        }

        if ('children' in node && node.type !== 'paragraph') walk(node as Parent)

        if (node.type !== 'paragraph') continue
        const p = node as Paragraph
        if (p.children[0]?.type !== 'text') continue
        const first = p.children[0] as Text

        // kramdown accepts a block IAL either after its block or on the line directly
        // before it. cv.md uses both: `{:.cv-listing}` follows its list, while
        // `{:.cv-biography}` sits above the paragraph it applies to — and being on the line
        // above means it is part of that same paragraph.
        const leading = /^\{:([^}]*)\}\r?\n/.exec(first.value)
        if (leading) {
          const parsed = parseIal(leading[1]!)
          const data = ((node as RootContent & { data?: any }).data ??= {})
          const props = (data.hProperties ??= {})
          if (parsed.id) props.id = parsed.id
          if (parsed.classes.length) {
            props.className = [...toArray(props.className), ...parsed.classes]
          }
          Object.assign(props, parsed.attrs)
          first.value = first.value.slice(leading[0].length)
          continue
        }

        // A trailing IAL is a paragraph of its own containing exactly one text node.
        if (p.children.length !== 1) continue
        const m = IAL_LINE.exec(first.value.trim())
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

/** The deepest, last text node in a subtree — where a lazy-continued IAL ends up. */
function lastText(node: Parent): Text | null {
  const children = (node as Parent).children
  if (!children?.length) return null
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i]!
    if (child.type === 'text') return child as Text
    if ('children' in child) {
      const found = lastText(child as Parent)
      if (found) return found
    }
  }
  return null
}

/** Merges an attribute list into a node's hProperties. */
function applyIal(node: RootContent, parsed: { id?: string; classes: string[]; attrs: Record<string, string> }) {
  const data = ((node as RootContent & { data?: any }).data ??= {})
  const props = (data.hProperties ??= {})
  if (parsed.id) props.id = parsed.id
  if (parsed.classes.length) props.className = [...toArray(props.className), ...parsed.classes]
  Object.assign(props, parsed.attrs)
}

const toArray = (v: unknown): string[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/\s+/)

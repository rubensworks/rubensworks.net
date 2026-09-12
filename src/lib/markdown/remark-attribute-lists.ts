import type { Root, RootContent, Parent, Paragraph, Text } from 'mdast'
import { IAL_META_PREFIX } from './shiki-rouge-wrapper'

/**
 * kramdown block-level inline attribute lists: `{:.cv-listing}` or
 * `{:#demo-nodejs-preamble .hide}` applies those attributes to the neighbouring block.
 * remark has no such syntax, so without this the braces render as literal text.
 *
 * Three placements, which reach the parser looking quite different:
 *   after a fenced code block   -> its own paragraph
 *   after a list, no blank line -> folded into the last item as a lazy continuation
 *   on the line above a paragraph -> the first line of that paragraph
 *
 * Anything else throws rather than being silently dropped.
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

        // No blank line before it, so CommonMark folds it into the last list item.
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

        // An IAL may also sit on the line directly *above* its block, which makes it the
        // first line of that same paragraph.
        const leading = /^\{:([^}]*)\}\r?\n/.exec(first.value)
        if (leading) {
          applyIal(node, parseIal(leading[1]!))
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
        // Shiki rebuilds the fence and drops hProperties, so the IAL rides along in the
        // fence's `meta` string instead. See shiki-rouge-wrapper.ts.
        if (target.type === 'code') {
          const payload = JSON.stringify({ id: parsed.id, classes: parsed.classes })
          const code = target as RootContent & { meta?: string | null }
          code.meta = `${code.meta ? `${code.meta} ` : ''}${IAL_META_PREFIX}${payload}`
          parent.children.splice(i, 1)
          continue
        }

        applyIal(target, parsed)
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
function applyIal(node: RootContent, parsed: Parsed) {
  const data = ((node as RootContent & { data?: any }).data ??= {})
  const props = (data.hProperties ??= {})
  if (parsed.id) props.id = parsed.id
  if (parsed.classes.length) props.className = [...toArray(props.className), ...parsed.classes]
  Object.assign(props, parsed.attrs)
}

const toArray = (v: unknown): string[] =>
  v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/\s+/)

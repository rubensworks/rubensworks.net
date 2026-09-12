import type { Root, Element, Parent, ElementContent } from 'hast'

/**
 * Builds the markup around every code block:
 *
 *   <div class="language-json highlighter-rouge">
 *     <div class="highlight">
 *       <pre class="highlight"><code>…</code></pre>
 *     </div>
 *   </div>
 *
 * `_sass/_syntax-highlighting.scss` and `_base.scss` hang their selectors off those class
 * names. A block with no info string gets no language class and is left unhighlighted; a
 * block-level attribute list lands on the *outer* div, ahead of `highlighter-rouge`; and
 * Shiki's own `astro-code` class, inline colours and `tabindex` are dropped, since the
 * stylesheet supplies all of it.
 *
 * Runs after highlighting, because Astro applies Shiki before the configured rehypePlugins.
 */
export function rehypeRougeBlocks() {
  return (tree: Root) => {
    const visit = (parent: Parent) => {
      const children = parent.children ?? []
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (child?.type !== 'element') continue
        const el = child as Element

        if (el.tagName !== 'pre') {
          visit(el as unknown as Parent)
          continue
        }
        if (!classesOf(el).includes('astro-code')) continue

        const code = el.children.find(
          (c): c is Element => c.type === 'element' && c.tagName === 'code',
        )
        if (!code) continue

        const rawLang = String(el.properties?.['dataLanguage'] ?? '')
        const language = rawLang && rawLang !== 'plaintext' ? rawLang : undefined

        // The attribute list, smuggled through Shiki by shiki-rouge-wrapper.ts.
        const ial = parseIal(el.properties?.['dataRougeIal'])

        const outerProps: Record<string, unknown> = {}
        if (ial.id) outerProps.id = ial.id
        outerProps.className = [
          ...ial.classes,
          ...(language ? [`language-${language}`] : []),
          'highlighter-rouge',
        ]

        // An unlexed block is plain text, with no token spans at all.
        const codeChildren = withTrailingNewline(
          language ? unwrapLines(code.children) : [flatten(code.children)],
        )

        children[i] = {
          type: 'element',
          tagName: 'div',
          properties: outerProps,
          children: [
            {
              type: 'element',
              tagName: 'div',
              properties: { className: ['highlight'] },
              children: [
                {
                  type: 'element',
                  tagName: 'pre',
                  properties: { className: ['highlight'] },
                  children: [
                    { type: 'element', tagName: 'code', properties: {}, children: codeChildren },
                  ],
                },
              ],
            },
          ],
        } as Element
      }
    }
    visit(tree as unknown as Parent)
  }
}

/** Shiki writes `class`; remark-rehype writes `className`. Both occur in one tree. */
function classesOf(el: Element): string[] {
  const v = el.properties?.className ?? el.properties?.['class']
  return v === undefined || v === null ? [] : Array.isArray(v) ? v.map(String) : String(v).split(/\s+/)
}

function parseIal(raw: unknown): { id?: string; classes: string[] } {
  if (typeof raw !== 'string' || raw === '') return { classes: [] }
  try {
    const parsed = JSON.parse(raw) as { id?: string; classes?: string[] }
    return { id: parsed.id, classes: parsed.classes ?? [] }
  } catch {
    return { classes: [] }
  }
}

/** Shiki strips the fence's closing newline; inside a `<pre>` that is visible. */
function withTrailingNewline(children: ElementContent[]): ElementContent[] {
  const last = children[children.length - 1]
  if (last?.type === 'text') {
    if (!last.value.endsWith('\n')) last.value += '\n'
    return children
  }
  return [...children, { type: 'text', value: '\n' } as ElementContent]
}

/**
 * Removes Shiki's per-line `<span class="line">` wrappers, leaving token spans directly
 * inside `<code>`. Shiki's `structure: 'inline'` would do this, but Astro does not forward it.
 */
function unwrapLines(children: ElementContent[]): ElementContent[] {
  const out: ElementContent[] = []
  for (const child of children) {
    if (
      child.type === 'element' &&
      child.tagName === 'span' &&
      classesOf(child).includes('line')
    ) {
      out.push(...child.children)
    } else {
      out.push(child)
    }
  }
  return out
}

const textOf = (n: any): string =>
  n.type === 'text' ? n.value : (n.children ?? []).map(textOf).join('')

const flatten = (children: ElementContent[]): ElementContent =>
  ({ type: 'text', value: children.map(textOf).join('') }) as ElementContent

import type { Element } from 'hast'

/**
 * Carries a code block's inline attribute list across the Shiki pass.
 *
 * Astro highlights *before* the configured rehypePlugins, and Shiki rebuilds the `<pre>`
 * from scratch, so an attribute list recorded on the mdast `code` node is gone by the time
 * rehype-rouge-blocks.ts needs it. It travels in the fence's `meta` string, which Shiki does
 * pass to transformers, and is re-attached to the `<pre>` as a data attribute.
 */
export const IAL_META_PREFIX = 'rouge-ial='

export function rougeIalTransformer() {
  return {
    name: 'rouge-ial',
    pre(this: { options: { meta?: { __raw?: string } } }, node: Element) {
      const raw = this.options?.meta?.__raw
      if (!raw) return
      const i = raw.indexOf(IAL_META_PREFIX)
      if (i < 0) return
      node.properties = {
        ...node.properties,
        dataRougeIal: raw.slice(i + IAL_META_PREFIX.length).trim(),
      }
    },
  }
}

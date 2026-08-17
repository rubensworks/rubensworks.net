import type { Element } from 'hast'

/**
 * Carries a code block's inline attribute list across the Shiki pass.
 *
 * Astro highlights *before* running the configured rehypePlugins, and Shiki rebuilds the
 * `<pre>` from scratch — so `{:#demo-nodejs-preamble .hide}`, which remark-attribute-lists
 * recorded on the mdast `code` node, would be gone by the time `rehype-rouge-blocks.ts`
 * needs it to build the outer div. The attribute list is smuggled through the code fence's
 * `meta` string, which Shiki does hand to transformers, and re-attached to the `<pre>` as a
 * data attribute for that plugin to consume.
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

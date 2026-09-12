import type { Root, Element, Parent } from 'hast'
import { imgEnhancement, enhanceImgTags, type ImgAttributes } from '../images'

/**
 * Applies src/lib/images.ts to the images in a post — both the ones written as Markdown,
 * which arrive as elements, and the ones written as raw HTML, which arrive as a string.
 *
 * Images the build cannot resolve — an external URL, or a file not in `public/` — are left
 * exactly as they were written.
 */

export function rehypeImages() {
  return (tree: Root) => {
    const visit = (node: Parent) => {
      const children = node.children ?? []
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as any

        if (child.type === 'raw' && typeof child.value === 'string' && /<img\s/i.test(child.value)) {
          child.value = enhanceImgTags(child.value)
          continue
        }

        if (child.type !== 'element') continue
        const el = child as Element

        if (el.tagName === 'picture') continue // hand-written: left as it is
        if (el.tagName !== 'img') {
          visit(el)
          continue
        }

        const attrs: ImgAttributes = Object.fromEntries(
          Object.entries(el.properties ?? {}).map(([k, v]) => [
            k.toLowerCase(),
            Array.isArray(v) ? v.join(' ') : String(v ?? ''),
          ]),
        )
        // hast spells the class list `className`; the rules above read `class`.
        attrs.class ??= attrs.classname ?? ''

        const result = imgEnhancement(attrs)
        if (!result) continue

        el.properties = { ...el.properties, ...result.added }
        if (result.sources.length === 0) continue

        children[i] = {
          type: 'element',
          tagName: 'picture',
          properties: {},
          children: [
            ...result.sources.map(
              (s): Element => ({
                type: 'element',
                tagName: 'source',
                properties: { srcSet: s.src, type: s.type },
                children: [],
              }),
            ),
            el,
          ],
        } as Element
      }
    }

    visit(tree as unknown as Parent)
  }
}

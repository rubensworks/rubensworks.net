import type { Root, RootContent, Parent, Paragraph } from 'mdast'

/**
 * kramdown keeps an HTML comment that sits on its own line *inside* a paragraph; CommonMark
 * treats it as a block (HTML block type 2) and splits the paragraph in two.
 *
 * The 2026 post writes its intro with structural comments between the sentences:
 *
 *     <!-- Task         -->
 *     In this post, I want to raise the alarm …
 *     <!-- Object       -->
 *     I discuss where and how these restrictions …
 *
 * On the live site that is one `<p>`; under CommonMark it becomes three, which changes the
 * spacing readers see because `_base.scss` gives every paragraph a bottom margin.
 *
 * Runs of paragraphs and comment-only HTML nodes with no blank line between them are merged
 * back into a single paragraph, with the comment kept as inline HTML.
 */

const COMMENT_ONLY = /^<!--[\s\S]*?-->$/

/** True when only a single newline separates the two offsets — i.e. no blank line. */
function contiguous(source: string, endOffset: number, startOffset: number): boolean {
  const between = source.slice(endOffset, startOffset)
  return between.trim() === '' && (between.match(/\n/g) ?? []).length === 1
}

export function remarkInlineComments() {
  return (tree: Root, file: { value: string }) => {
    const source = String(file.value)

    const walk = (parent: Parent) => {
      const children = parent.children
      for (let i = 0; i < children.length; i++) {
        const node = children[i]!
        if ('children' in node && node.type !== 'paragraph') walk(node as Parent)
        if (node.type !== 'paragraph' && !isComment(node)) continue

        // Grow a run of paragraph / comment nodes that touch each other in the source.
        let end = i
        while (end + 1 < children.length) {
          const next = children[end + 1]!
          if (next.type !== 'paragraph' && !isComment(next)) break
          const prevEnd = children[end]!.position?.end.offset
          const nextStart = next.position?.start.offset
          if (prevEnd === undefined || nextStart === undefined) break
          if (!contiguous(source, prevEnd, nextStart)) break
          end++
        }
        if (end === i) continue
        // A run of paragraphs with no comment in it is just a lazy continuation, which
        // CommonMark already folds into one paragraph. Only comment-separated runs get here.
        if (!children.slice(i, end + 1).some(isComment)) continue

        const merged: RootContent[] = []
        for (let j = i; j <= end; j++) {
          const child = children[j]!
          if (j > i) {
            const gap = source.slice(children[j - 1]!.position!.end.offset!, child.position!.start.offset!)
            merged.push({ type: 'text', value: gap } as RootContent)
          }
          if (child.type === 'paragraph') merged.push(...((child as Paragraph).children as RootContent[]))
          else merged.push({ type: 'html', value: (child as any).value } as RootContent)
        }

        children.splice(i, end - i + 1, { type: 'paragraph', children: merged } as Paragraph)
      }
    }

    walk(tree)
  }
}

const isComment = (node: RootContent): boolean =>
  node.type === 'html' && COMMENT_ONLY.test(node.value.trim())

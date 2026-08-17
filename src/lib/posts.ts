import { getCollection, type CollectionEntry } from 'astro:content'
import { readFileSync } from 'node:fs'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { postUrl } from './dates'
import { EXCERPT_SEPARATOR } from './excerpt'
import { markdownOptions } from './markdown/pipeline'

export interface Post {
  entry: CollectionEntry<'posts'>
  url: string
  slug: string
  date: Date
  /** Rendered excerpt HTML — everything before <!--more-->. */
  excerpt: string
}

/** The date and slug Jekyll derived from the filename, e.g. 2019-03-13-streaming-rdf-parsers. */
function parseFilename(id: string): { slug: string; datePart: string } {
  const m = /^(\d{4}-\d{2}-\d{2})-(.+)$/.exec(id)
  if (!m) throw new Error(`Post filename "${id}" is not in Jekyll's YYYY-MM-DD-slug form`)
  return { datePart: m[1]!, slug: m[2]! }
}

const stripFrontmatter = (src: string) => src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')

let processor: Awaited<ReturnType<typeof createMarkdownProcessor>> | null = null

/**
 * Renders a post's excerpt the way Jekyll does: cut the *source* at
 * `excerpt_separator: <!--more-->`, then run the first half through the same Markdown
 * pipeline as the body.
 *
 * Reading `entry.rendered.html` and slicing that would be the obvious shortcut, but the
 * content layer does not reliably populate it for entries loaded through a custom entry
 * type — it came back empty for one post while the other five were fine. Rendering the
 * source directly is both closer to Jekyll's semantics and not dependent on that.
 */
async function renderExcerpt(filePath: string, id: string): Promise<string> {
  const body = stripFrontmatter(readFileSync(filePath, 'utf8'))
  const i = body.indexOf(EXCERPT_SEPARATOR)
  if (i < 0) throw new Error(`Post "${id}" has no ${EXCERPT_SEPARATOR} separator`)
  processor ??= await createMarkdownProcessor(markdownOptions as any)
  return (await processor.render(body.slice(0, i))).code
}

/** All posts, newest first — Jekyll's `site.posts` order. */
export async function loadPosts(): Promise<Post[]> {
  const entries = await getCollection('posts')
  const posts = await Promise.all(
    entries.map(async (entry) => {
      const { slug } = parseFilename(entry.id)
      const date = entry.data.date
      const filePath = entry.filePath ?? `_posts/${entry.id}.markdown`
      return {
        entry,
        slug,
        date,
        url: postUrl(date, slug),
        excerpt: await renderExcerpt(filePath, entry.id),
      }
    }),
  )
  posts.sort((a, b) => b.date.getTime() - a.date.getTime())
  return posts
}

import remarkSmartypants from 'remark-smartypants'
import { remarkMarkdownAttribute } from './remark-markdown-attribute'
import { remarkAttributeLists } from './remark-attribute-lists'
import { remarkInlineHtmlParagraph } from './remark-inline-html-paragraph'
import { remarkInlineComments } from './remark-inline-comments'
import { rehypeKramdown } from './rehype-kramdown'
import { rehypeRougeBlocks } from './rehype-rouge-blocks'
import { rehypeImages } from './rehype-images'
import { rougeIalTransformer } from './shiki-rouge-wrapper'
import { rougeLexerQuirks } from './shiki-rouge-quirks'
import { rougeGithub } from './shiki-rouge-github'

/**
 * The kramdown-compatible Markdown pipeline. Shared by astro.config.mjs and lib/posts.ts so
 * an excerpt renders exactly as the body it was cut from.
 */
export const markdownOptions = {
  // kramdown implements no GFM extensions. Autolink literals would nest an <a> inside the
  // hand-written mailto link on /contact/.
  gfm: false,
  // Re-added at the end of the chain below: Astro runs its own ahead of user plugins, and
  // remarkMarkdownAttribute re-parses from rewritten source, discarding the result.
  smartypants: false,
  remarkPlugins: [
    // First: markdown="…" re-parses raw HTML into blocks the rest then inspect.
    remarkMarkdownAttribute,
    remarkAttributeLists,
    remarkInlineHtmlParagraph,
    remarkInlineComments,
    // Last, per `smartypants` above.
    remarkSmartypants,
  ],
  // rehypeImages runs last: it reads the finished <img> tags, including the ones that were
  // still raw HTML when the plugins before it ran.
  rehypePlugins: [rehypeKramdown, rehypeRougeBlocks, rehypeImages],
  shikiConfig: {
    theme: rougeGithub as any,
    wrap: false,
    // Token spans straight into <code>, with no per-line <span class="line"> wrappers.
    structure: 'inline' as const,
    transformers: [rougeIalTransformer() as any, rougeLexerQuirks() as any],
  },
}

/**
 * hast matches any attribute starting with `data` against its `data-*` rule, so RDFa's
 * `datatype` is serialised back as `data-type` — silently rewriting every
 * `schema:datePublished` in the /cv/ bibliography blocks. Renaming the hast property does
 * not help; it is re-matched on the way out.
 *
 * `data-type` appears nowhere in the site's own markup, so undoing it on the rendered
 * string is unambiguous.
 */
export const restoreRdfaDatatype = (html: string): string =>
  html.replace(/\sdata-type="/g, ' datatype="')

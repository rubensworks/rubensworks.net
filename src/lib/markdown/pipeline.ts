import remarkSmartypants from 'remark-smartypants'
import { remarkMarkdownAttribute } from './remark-markdown-attribute'
import { remarkAttributeLists } from './remark-attribute-lists'
import { remarkInlineHtmlParagraph } from './remark-inline-html-paragraph'
import { remarkInlineComments } from './remark-inline-comments'
import { rehypeKramdown } from './rehype-kramdown'
import { rehypeRougeBlocks } from './rehype-rouge-blocks'
import { rougeIalTransformer } from './shiki-rouge-wrapper'
import { rougeLexerQuirks } from './shiki-rouge-quirks'
import { rougeGithub } from './shiki-rouge-github'

/**
 * The kramdown-compatible Markdown pipeline, in one place.
 *
 * Shared by `astro.config.mjs` (for pages and the posts collection) and `lib/posts.ts`
 * (which renders post excerpts). Keeping a single definition is what guarantees an excerpt
 * is rendered exactly as the body it was cut from.
 */
export const markdownOptions = {
  // OFF to match kramdown, which implements none of GFM's extensions: autolink literals
  // (which would nest an <a> inside the hand-written <a href="mailto:…">…</a> on /contact/),
  // strikethrough, task lists or footnotes. The content uses no GFM tables either, so
  // nothing is lost.
  gfm: false,
  // Astro's built-in smart typography is disabled and re-added at the *end* of the remark
  // chain instead. Astro inserts it ahead of the user plugins, and remarkMarkdownAttribute
  // re-parses the document from a rewritten source — which would throw away every curly
  // quote and ellipsis it had already produced.
  smartypants: false,
  remarkPlugins: [
    // Order matters: markdown="…" re-parses raw HTML into real blocks, so it has to run
    // before anything that inspects those blocks.
    remarkMarkdownAttribute,
    remarkAttributeLists,
    remarkInlineHtmlParagraph,
    remarkInlineComments,
    // Last, for the reason above.
    remarkSmartypants,
  ],
  rehypePlugins: [rehypeKramdown, rehypeRougeBlocks],
  shikiConfig: {
    theme: rougeGithub as any,
    wrap: false,
    // No per-line <span class="line"> wrappers — Rouge put token spans straight into <code>.
    structure: 'inline' as const,
    // Carries code-block inline attribute lists across the Shiki pass.
    transformers: [rougeIalTransformer() as any, rougeLexerQuirks() as any],
  },
}

/**
 * Restores the RDFa `datatype` attribute after a Markdown round trip.
 *
 * hast matches any attribute starting with `data` against its `data-*` rule, so `datatype`
 * is read as the property `dataType` and serialised back as `data-type`. That silently
 * rewrites the RDFa on every `schema:datePublished` in the bibliography blocks on /cv/,
 * which reach the pipeline as raw HTML and therefore make the round trip. Setting the
 * property back to `datatype` does not help — it is re-matched on the way out.
 *
 * `data-type` appears nowhere in the site's own markup (checked against the whole golden
 * tree), so undoing it on the rendered string is unambiguous.
 */
export const restoreRdfaDatatype = (html: string): string =>
  html.replace(/\sdata-type="/g, ' datatype="')

// A post's excerpt is everything before `<!--more-->`, rendered through the same Markdown
// pipeline as the body — so it is HTML, not a text snippet. It appears in three places: the
// listings on / and /blog/, <meta name="description">, and the feed.

export const EXCERPT_SEPARATOR = '<!--more-->'

/**
 * Extracts the excerpt from a rendered post body.
 *
 * Rendering the whole post and then cutting at the separator gives the same result as
 * cutting the source first, because the separator sits on its own line between block
 * elements in every post — asserted by the caller rather than assumed.
 */
export function excerptFromHtml(html: string): string {
  const i = html.indexOf(EXCERPT_SEPARATOR)
  return i < 0 ? html : html.slice(0, i)
}

export const hasExcerpt = (html: string): boolean => html.includes(EXCERPT_SEPARATOR)

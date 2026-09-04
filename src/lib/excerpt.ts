// Jekyll's `excerpt_separator: <!--more-->` (plan §6.5).
//
// Jekyll splits the *source* on the separator and renders the first part through the same
// markdown pipeline as the body, so the excerpt is rendered HTML, not a text snippet. It
// appears in two places: `post-listing.html` prints it on / and /blog/, and `head.html`
// derives <meta name="description"> from it.

export const EXCERPT_SEPARATOR = '<!--more-->'

/**
 * Extracts the excerpt from a rendered post body.
 *
 * Rendering the whole post and then cutting at the separator gives the same result as
 * Jekyll's cut-then-render, because the separator sits on its own line between block
 * elements in all six posts — checked, and asserted by the caller.
 */
export function excerptFromHtml(html: string): string {
  const i = html.indexOf(EXCERPT_SEPARATOR)
  return i < 0 ? html : html.slice(0, i)
}

export const hasExcerpt = (html: string): boolean => html.includes(EXCERPT_SEPARATOR)

// The list of differences that are accepted between the Jekyll baseline and the Astro
// build, each with the reason it is not a fidelity regression. Every entry here shows up
// in the html-diff report, so nothing is silently swallowed.

export const JUSTIFIED = [
  {
    id: 'site-stylesheet-link',
    why:
      'The site stylesheet <link> is removed from both sides before comparison and checked ' +
      'separately (exactly one per page on each side). Two accepted changes ride on it: the ' +
      'href is Astro\'s content-hashed /_astro/<name>.<hash>.css instead of /css/main.css ' +
      '(requested, for cache-busting), and Astro injects it at the end of <head> rather than ' +
      'before the two Google Fonts <link>s. The relocation is inert — main.css sets ' +
      'font-family, the font sheets only declare @font-face, so neither overrides the other ' +
      '— and the screenshot pass at 1280/800/560 px is what confirms it.',
  },
  {
    id: 'code-token-markup',
    why:
      'Inside <pre class="highlight"><code>, the token <span>s are reduced to their text on ' +
      'both sides. Rouge emitted Pygments class names (<span class="k">) that no JS ' +
      'highlighter produces; the replacement is a Shiki theme carrying the same colours as ' +
      'inline styles, which is the trade-off chosen for plan §6.7. Everything around the ' +
      'tokens is still compared exactly — the wrapper divs, the language class, the <pre> ' +
      'and <code>, and the code text itself, character for character. The colours are ' +
      'checked by verify/code-colors.mjs, which resolves every visible code character to ' +
      'its effective colour, weight and slant on both sides and requires them to match.',
  },
  {
    id: 'feed-description-as-html',
    why:
      "feed.xml's <description> holds the whole rendered post as escaped HTML, so it is " +
      'unescaped and compared as a DOM instead of as a string — the same comparison every ' +
      'page gets, and what an RSS reader actually does with it. Three serialisation-only ' +
      'differences would otherwise show: kramdown wrote block separators as a blank line ' +
      'where remark-rehype writes one newline; kramdown closed void elements XHTML-style ' +
      '(<img />); and kramdown nested <center> inside <p> where an HTML parser closes the ' +
      'paragraph first, as every browser does on both sides.',
  },
  {
    id: 'feed-build-time',
    why:
      "feed.xml's channel-level <pubDate>/<lastBuildDate> are the build timestamp. They " +
      'differ between any two builds, including two consecutive Jekyll builds. The ' +
      '<pubDate> inside each <item> is the post date and is compared as normal.',
  },
]

/** Matches the site stylesheet link on either side (Jekyll's fixed path or Astro's hashed). */
const SITE_STYLESHEET =
  /[ \t]*<link rel="stylesheet"[^>]*href="(?:\/css\/main\.css|\/_astro\/[^"]*\.css)"[^>]*>\n?/g

/** Counts the site stylesheet links so removing them cannot hide a missing/duplicated one. */
export function countStylesheetLinks(html) {
  return (html.match(SITE_STYLESHEET) ?? []).length
}

/**
 * Strips syntax-highlighting token spans inside code blocks, leaving the code text. Only the
 * `<span>` tags go — the text between them is untouched, so a change to the code itself
 * still fails the diff.
 */
function stripCodeTokens(html) {
  return html.replace(
    /(<pre class="highlight"><code>)([\s\S]*?)(<\/code><\/pre>)/g,
    (_, open, body, close) => open + body.replace(/<span\b[^>]*>|<\/span>/g, '') + close,
  )
}

/** Rewrites both sides so accepted differences do not mask real ones. */
export function normalizeHtml(html) {
  return stripCodeTokens(html.replace(SITE_STYLESHEET, ''))
}

const DESCRIPTION = /<description>([\s\S]*?)<\/description>/g

/**
 * Replaces each <description> with a placeholder; the bodies are compared separately.
 *
 * Only the channel's own <pubDate>/<lastBuildDate> are blanked — the ones before the first
 * <item>. Each item carries a <pubDate> too, and that one is the post's date: content, not a
 * timestamp, and a regression in it has to fail.
 */
export function normalizeXml(xml) {
  let i = 0
  const firstItem = xml.indexOf('<item>')
  const cut = firstItem < 0 ? xml.length : firstItem
  const head = xml
    .slice(0, cut)
    .replace(/<(pubDate|lastBuildDate)>[^<]*<\/\1>/g, '<$1>BUILD_TIME</$1>')
  return (head + xml.slice(cut)).replace(
    DESCRIPTION,
    () => `<description>DESCRIPTION_${i++}</description>`,
  )
}

/** The escaped HTML inside each <description>, unescaped, in document order. */
export function extractDescriptions(xml) {
  return [...xml.matchAll(DESCRIPTION)].map(([, body]) =>
    body
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  )
}

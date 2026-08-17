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
    id: 'feed-build-time',
    why:
      'feed.xml <pubDate>/<lastBuildDate> are the build timestamp. They differ between any ' +
      'two builds, including two consecutive Jekyll builds.',
  },
]

/** Matches the site stylesheet link on either side (Jekyll's fixed path or Astro's hashed). */
const SITE_STYLESHEET =
  /[ \t]*<link rel="stylesheet"[^>]*href="(?:\/css\/main\.css|\/_astro\/[^"]*\.css)"[^>]*>\n?/g

/** Counts the site stylesheet links so removing them cannot hide a missing/duplicated one. */
export function countStylesheetLinks(html) {
  return (html.match(SITE_STYLESHEET) ?? []).length
}

/** Rewrites both sides so accepted differences do not mask real ones. */
export function normalizeHtml(html) {
  return html.replace(SITE_STYLESHEET, '')
}

export function normalizeXml(xml) {
  return xml.replace(
    /<(pubDate|lastBuildDate)>[^<]*<\/\1>/g,
    '<$1>BUILD_TIME</$1>',
  )
}

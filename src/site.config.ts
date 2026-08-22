// The former _config.yml. Values are reproduced verbatim, including the trailing newline on
// `description`, which comes from the YAML folded scalar (`description: >`) and is visible in
// the rendered <meta name="description">, the footer and feed.xml.

export const site = {
  title: 'Ruben Taelman',
  email: 'example@example.com',
  description: 'Computer scientist, researcher, programmer\n',
  baseurl: '',
  excerptSeparator: '<!--more-->',
  url: 'https://www.rubensworks.net',
  twitterUsername: 'rubensworks',
  githubUsername: 'rubensworks',
  linkedinUsername: 'taelmanruben',
  googlescholarUsername: '2avKLOkAAAAJ',
  googleAnalyticsTrackingId: 'G-8CPYVR6R0T',

  // _config.yml `scholar:` — see src/lib/bibliography.ts and src/lib/bibtex-serialise.ts
  scholar: {
    sortBy: ['year', 'month'] as const,
    order: 'descending' as const,
    detailsDir: 'publications',
    detailsLink: 'More',
    detailsLinkClass: 'details',
    bibliographyListTag: 'ol',
    bibliographyItemTag: 'li',
    bibliographyGroupTag: 'h2',
    bibtexSkipFields: [
      'abstract',
      'month_numeric',
      '_type',
      '_slides',
      '_poster',
      '_video',
      '_highlighted',
    ],
  },

  // feed.xml prints `Jekyll v{{ jekyll.version }}`. Kept as a literal so the generated feed
  // stays byte-identical to the one currently served; changing it would be a visible,
  // pointless difference in every subscriber's reader.
  generator: 'Jekyll v3.8.7',
} as const

/** `site.url + site.baseurl + path` — Jekyll's `prepend: site.baseurl | prepend: site.url`. */
export const absoluteUrl = (path: string): string => `${site.url}${site.baseurl}${path}`

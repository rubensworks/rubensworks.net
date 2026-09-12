// Site-wide settings. The trailing newline on `description` is deliberate: it shows up in
// the rendered <meta name="description">, the footer and feed.xml, and removing it would
// change all three.

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

  // Bibliography settings — see src/lib/bibliography.ts and src/lib/bibtex-serialise.ts.
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

  // <generator> in feed.xml.
  generator: 'Astro v7.2.2',
} as const

/** `site.url + site.baseurl + path`. */
export const absoluteUrl = (path: string): string => `${site.url}${site.baseurl}${path}`

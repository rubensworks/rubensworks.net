// The navigation bar, listed here rather than derived from front matter across a mix of
// .astro and .md pages.
//
// Note what is deliberately NOT here: an `active` class on the current page. The markup has
// never carried one, and adding it would need a matching style.

export interface NavPage {
  title: string
  url: string
  /** The former `order:` front-matter key, kept for provenance. */
  order: number
}

export const navPages: NavPage[] = [
  { title: 'About Me', url: '/about/', order: 0 },
  { title: 'Blog', url: '/blog/', order: 1 },
  { title: 'Projects', url: '/projects/', order: 2 },
  { title: 'Publications', url: '/publications/', order: 3 },
  { title: 'Presentations', url: '/presentations/', order: 4 },
  { title: 'Contact', url: '/contact/', order: 999 },
]

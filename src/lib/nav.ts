// The navigation bar was `{% assign sorted_pages = site.pages | sort:"order" %}` filtered by
// `{% if my_page.title and my_page.show_in_nav != false %}`. Rather than re-deriving that
// from front matter across a mix of .astro and .md pages, the six navigable pages are listed
// here in their rendered order, which is what the template actually produced.
//
// Note what is deliberately NOT here: the original emitted `class="a-white page-link{% if
// p.url == page.url %} active{% endif %}"`, and `p` is never assigned — the loop variable is
// `my_page`. So `active` was never applied to any link on any page. Reproduced as-is.

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

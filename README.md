Source code for my personal website: https://www.rubensworks.net

Built with [Astro](https://astro.build/), TypeScript and Sass. The output is fully static.
Fonts are self-hosted, images are served as AVIF or WebP with the original as the fallback,
and every page carries its own title, description and canonical URL.

The client-side JavaScript is three Linked Data features, all run in the browser by
[Comunica](https://comunica.dev/) in one shared web worker:

- the author card: hovering a co-author's name in a bibliography queries that person's own
  FOAF profile, then dblp and Wikidata, and shows what it finds;
- the co-author graph on `/publications/`: opening the panel queries the RDFa of the page
  itself for every pair of co-authors and draws the result, with the author card working on
  the nodes and a click filtering the list (`#author=<iri>`);
- the publication card: hovering a title on `/publications/` shows the paper's dblp record,
  its citation count in the OpenCitations index (via `dblp:omid`) and the most cited papers
  citing it. One query fetches every record on the first hover and is cached for a week.

Everything those features show comes from other people's documents, so it is only ever
written to the page as text, and only `http(s)` IRIs become links or images. Portraits on
the graph are fetched after the drawing is interactive, only for the visible nodes, and only
when a CORS `HEAD` request reports an image under 512 KB.

The pages publish structured data about their content — RDFa, microdata and JSON-LD, using
`foaf:`, `schema.org`, `bibframe:`, `vivo:`, `org:` and `cert:`. That is why the templates
carry so many `property`, `typeof`, `resource` and `itemprop` attributes; they are part of
the output, not decoration.

## Content

| Path | What it holds |
|---|---|
| `_bibliography/references.bib` | every publication — the publication pages, the CV and the homepage all read from it |
| `_data/*.yml` | presentations, PhD and master's students, and the people linked from `foaf:knows` |
| `_posts/*.markdown` | blog posts, written in kramdown |
| `_projects/*.html` | one file per project page |
| `_sass/*.scss` | the stylesheet, imported by `css/main.scss` |
| `cv.md`, `reading_list.md` | pages that build themselves from the bibliography and `_data`, using a small Liquid subset |
| `public/`, `css/main.scss` | images, fonts, `robots.txt`, `ads.txt`, and the stylesheet entry point — copied or compiled through as they are |

Everything under `src/` is templates and code: `src/pages` for routes, `src/layouts` and
`src/components` for the shell, `src/lib` for the bibliography engine and the Markdown
pipeline, and `src/scripts` for the only code that runs in the reader's browser. There, the
`*-queries.ts` files and `graph-layout.ts` are DOM-free and unit-tested, `foaf-worker.ts` is
the one place Comunica is imported, and the rest is the main-thread glue.

## Development

```bash
npm install
npm run dev      # local server with hot reload
npm run build    # static site into dist/
npm test         # vitest
```

`npm run check:links` verifies that every internal link and in-page anchor resolves, and
fails if one does not. It does not check external links, so a dead `url` in `_data/knows.yml`
will not fail a build.

`npm run check:seo` verifies what search engines and browsers read: a unique title and
description on every page, a canonical URL, one `<main>`, images with alt text and
dimensions, `<picture>` sources that exist, and a sitemap that lists every page.

`npm run check:images` verifies that every image is within the width it is displayed at and
has an AVIF and a WebP beside it. It reads image headers rather than re-encoding, so it is
fast and does not depend on the machine's libvips.

`npm run check:content` adds an entry to every input file — a publication, a post, a
project, and each `_data/*.yml` — then runs the tests and the build and checks the new
content actually reached the pages it belongs on, restoring everything afterwards. It exists
so that **adding content never requires touching the tests**: it fails both if an ordinary
edit breaks the suite, and if an entry is silently dropped from a page.

All of these run in CI, and the deploy only happens on `master`.

## Adding a publication

Add the entry to `_bibliography/references.bib`. A page at `/publications/<citation-key>/`
appears on the next build, and the entry shows up on `/publications/`, on the CV, and — if
it carries `_highlighted = {true}` — on the homepage. The non-standard `_type`, `_slides`,
`_poster`, `_video` and `_highlighted` fields are what drive that; `test/bibliography.test.ts`
covers the values currently in use.

## Writing a post

Add a file to `_posts/`, named `YYYY-MM-DD-slug.markdown`. The front matter takes `layout`,
`title`, `subtitle`, `date`, `categories`, `tags`, `comments` and `feature_img`.
`<!--more-->` marks the end of the excerpt shown on `/blog/` and in the feed — and, since
there is nothing else to describe the post with, it is also the `<meta name="description">`
and the text a link preview shows, so it is worth writing as a summary rather than as an
opening line.

An image with `class="feature-img"` is loaded eagerly, since it is the first thing on screen;
every other image on the page waits.

## Page descriptions

Every page carries its own `<meta name="description">`, and `npm run check:seo` fails if one
does not. Where it comes from depends on the page: a post uses its excerpt, a publication its
abstract, a project its front-matter `description`, and everything else takes a `description`
prop (`.astro`) or front-matter key (`.md`). The site-wide tagline is a fallback that now
fails the check — 109 pages shared it before.

## Images

Put the image in `public/img/` and reference it as `/img/...`. Then run `npm run images`,
which resizes it to twice the width it is displayed at, re-encodes it, and writes an AVIF and
a WebP beside it; commit all of those. The build fills in the `width`, `height`, `loading`
and `decoding` attributes and wraps the tag in a `<picture>` — in a post, a project page, the
reading list, or a template, it is the same rule (`src/lib/images.ts`). An image you size
yourself, with a `width` attribute, keeps what you gave it.

The display widths are listed in `scripts/optimise-images.mjs`; a new place that shows images
at a different size belongs in that table.

Renaming or deleting an image is the one thing to be careful with: other sites hotlink these
URLs, and a post's feature image is its `og:image`, so it lives on in every social card that
was ever shared. Re-encoding a file in place is safe, since the URL does not change. Removing
one is not, so the old file stays where it is and is listed in `KEPT_AS_PUBLISHED` in that
script, which leaves it alone and fails `npm run check:images` if it ever goes missing. The
three PNG photographs now served as JPEG are there for that reason; nothing on this site
fetches them. `npm run icons` regenerates the favicon and the app
icons from `public/img/ruben.jpg`, and is only needed if that photograph changes.

## Fonts

Open Sans and Droid Sans are served from `public/fonts/` rather than from Google Fonts, which
is two fewer render-blocking requests. Only weight 400 is shipped, which is all Google Fonts
served too: bold text is synthesised by the browser, and adding a real bold face would change
how every `<strong>` on the site looks. The `@font-face` rules are in `_sass/_fonts.scss` and
`src/components/Head.astro` preloads both files.

## Image credits

Github icon provided by Jekyll

X icon based on the X brand mark

Google Plus icon made by Freepik from www.flaticon.com

LinkedIn icon made by SimpleIcon from www.flaticon.com

Google Scholar icon made by Freepik from www.flaticon.com

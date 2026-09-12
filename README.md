Source code for my personal website: https://www.rubensworks.net

Built with [Astro](https://astro.build/), TypeScript and Sass. The output is fully static.

The one piece of client-side JavaScript is the author hover card: hovering a co-author's name
in a bibliography queries that person's own FOAF profile with
[Comunica](https://comunica.dev/), in the browser, and shows what it finds. See
[Author hover cards](#author-hover-cards).

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
| `public/`, `css/main.scss` | images, `ads.txt`, and the stylesheet entry point — copied or compiled through as they are |

Everything under `src/` is templates and code: `src/pages` for routes, `src/layouts` and
`src/components` for the shell, `src/lib` for the bibliography engine and the Markdown
pipeline, and `src/scripts` for the only code that runs in the reader's browser.

## Author hover cards

Hovering a co-author's name on `/`, `/publications/`, `/cv/` or a publication page looks that
person up and shows a card with whatever they publish about themselves — a photo, a job
title, an affiliation. Nothing is stored here: the lookup happens in the reader's browser,
against the person's own server, when they hover.

The identifier comes from markup the pages already carry. `_data/knows.yml` gives each person
a `foaf` value, which the templates emit as the `resource` attribute of `a.author` for the
RDFa the pages publish, and that is exactly what a query needs.

| File | What it does |
|---|---|
| `src/scripts/foaf-queries.ts` | the SPARQL, and the folding of its results into one value per field — no DOM, no engine, so `test/foaf-queries.test.ts` can exercise it directly |
| `src/scripts/foaf-worker.ts` | the only place Comunica is imported, so Vite emits it as its own chunk |
| `src/scripts/foaf-tooltip.ts` | finds the links, decides when a hover is deliberate, draws the card, caches results |
| `src/components/FoafTooltip.astro` | loads the controller; included from `Default.astro` |
| `_sass/_foaf-tooltip.scss` | the card |

Whether the card belongs on screen is decided from where the pointer actually is, not from
`mouseover`/`mouseout`. Those events report what crossed the pointer, and Chromium does not
reliably dispatch them when the page moves under a still cursor — scrolling 20 px away from a
name fires no `mouseout` at all. A scroll dismisses the card unless the name is still under
the pointer; the card's own area only counts when the pointer actually moved onto it, since
it is drawn just below the name and grows as each stage lands.

Three things about this are load-bearing rather than incidental:

**Comunica runs in a Web Worker.** It is around 560 KB gzipped and parsing a profile is real
work, so on the main thread it would land as jank while the reader scrolls. The worker is
created when the pointer first reaches an author name and reused for the rest of the page,
and it holds one `QueryEngine` for its whole life: constructing one costs about 230 ms, and
the instance is also what caches dereferenced documents between hovers.

**`vite.define.global` in `astro.config.mjs` is required, not cosmetic.** Comunica's
dependency tree still carries UMD footers of the form
`typeof window < 'u' ? window.X = e : global.X = e`. A worker has neither, so without that
define the worker dies on load with `ReferenceError: global is not defined`.

**Sources are passed as bare URLs.** `_data/knows.yml` mixes Solid pods, static Turtle,
JSON-LD, RDFa in plain HTML, dblp identifiers and Triple Pattern Fragments endpoints, and
Comunica identifies each one itself. Declaring source types here would mean keeping a
parallel classification of the same address book in sync with it.

The lookup runs in three stages, each rendered as it arrives: the person's own profile
document, then `sparql.dblp.org` for an affiliation, then Wikidata for a one-line
description. They are separate queries because a single federated one over both endpoints
did not finish inside 30 seconds — neither endpoint can push down a filter the other owns.

Coverage is partial by nature, and the card is built to show nothing rather than an error:
of the 96 people in `knows.yml`, 47 publish queryable data and 17 publish a photo. Adding a
`foaf` value that resolves to RDF is all it takes for someone to appear.

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

`npm run check:content` adds an entry to every input file — a publication, a post, a
project, and each `_data/*.yml` — then runs the tests and the build and checks the new
content actually reached the pages it belongs on, restoring everything afterwards. It exists
so that **adding content never requires touching the tests**: it fails both if an ordinary
edit breaks the suite, and if an entry is silently dropped from a page.

Both run in CI after the build, and the deploy only happens on `master`.

## Adding a publication

Add the entry to `_bibliography/references.bib`. A page at `/publications/<citation-key>/`
appears on the next build, and the entry shows up on `/publications/`, on the CV, and — if
it carries `_highlighted = {true}` — on the homepage. The non-standard `_type`, `_slides`,
`_poster`, `_video` and `_highlighted` fields are what drive that; `test/bibliography.test.ts`
covers the values currently in use.

## Writing a post

Add a file to `_posts/`, named `YYYY-MM-DD-slug.markdown`. The front matter takes `layout`,
`title`, `subtitle`, `date`, `categories`, `tags` and `comments`. `<!--more-->` marks the end
of the excerpt shown on `/blog/` and in the feed.

## Images

Github icon provided by Jekyll

Twitter icon provided by Jekyll

Google Plus icon made by Freepik from www.flaticon.com

LinkedIn icon made by SimpleIcon from www.flaticon.com

Google Scholar icon made by Freepik from www.flaticon.com

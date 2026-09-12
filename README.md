Source code for my personal website: https://www.rubensworks.net

Built with [Astro](https://astro.build/), TypeScript and Sass. The output is fully static.

The one piece of client-side JavaScript is the author hover card: hovering a co-author's name
in a bibliography queries that person's own FOAF profile with
[Comunica](https://comunica.dev/), in the browser, and shows what it finds.

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

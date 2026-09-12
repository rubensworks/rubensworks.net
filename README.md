Source code for my personal website: https://www.rubensworks.net

Built with [Astro](https://astro.build/). Content lives in the same places it always has:
`_bibliography/references.bib`, `_data/*.yml`, `_posts/*.markdown`, `_projects/*.html`,
`_sass/*.scss`, `cv.md` and `reading_list.md`.

## Development

```bash
npm install
npm run dev      # local server with hot reload
npm run build    # static site into dist/
npm test         # vitest
```

`npm run check:links` verifies that every internal link and in-page anchor resolves, and
fails if one does not. It runs in CI after the build.

## Verifying against the old Jekyll site

The migration was checked against a golden build of the last Jekyll commit: a structural DOM
diff of all 121 pages, a per-page RDF graph comparison, a stylesheet comparison, a
character-by-character comparison of syntax-highlighting colours, and a Playwright pixel
comparison at 1280/800/560 px.

That tooling is **not** in this branch — it only makes sense next to a Jekyll build, and
this repository no longer has one. It lives on
[`claude/jekyll-astro-migration-verify-tooling`](https://github.com/rubensworks/rubensworks.net/tree/claude/jekyll-astro-migration-verify-tooling),
which is the migration branch with `verify/` still present, and is kept around unmerged for
any future change that should not alter the rendered output. Check it out, rebuild the
baseline as its README describes, and run `npm run verify`.

## Images

Github icon provided by Jekyll

Twitter icon provided by Jekyll

Google Plus icon made by Freepik from www.flaticon.com

LinkedIn icon made by SimpleIcon from www.flaticon.com

Google Scholar icon made by Freepik from www.flaticon.com

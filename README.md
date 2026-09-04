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

`verify/` holds the tooling used for the Jekyll → Astro migration. It compares a build
against a reference tree — by DOM, by extracted RDF graph, and by screenshot — and is worth
keeping around for any change that should not alter the rendered output.

To rebuild the baseline, check out the last Jekyll commit (`6e1823c`, the parent of the
migration) into a scratch directory and build it there. It needs Ruby 2.7 — `bibtex-ruby`
4.4.7 calls `Proc.new` without a block, which was removed in Ruby 3.0 — hence the container:

```bash
git worktree add /tmp/jekyll 6e1823c
docker run --rm -v /tmp/jekyll:/src -w /src ruby:2.7 \
  bash -c 'bundle install && bundle exec jekyll build -d /src/_site'
cp -r /tmp/jekyll/_site _site_golden
```

Then:

```bash
npm run verify        # tests, DOM diff, RDF graph diff, CSS diff, code colours, link check
npm run verify:shots  # Playwright, 1280/800/560 px, Google Fonts blocked on both sides
```

The screenshot pass is separate because it is slow — 23 pages at three viewports, each
rendered twice and compared pixel by pixel. Run it before anything that touches templates,
CSS or the Markdown pipeline.

Each script prints the differences it accepts and why; anything else fails. The individual
steps are `verify:html`, `verify:rdf`, `verify:css`, `verify:colors` and `check:links`.

## Images

Github icon provided by Jekyll

Twitter icon provided by Jekyll

Google Plus icon made by Freepik from www.flaticon.com

LinkedIn icon made by SimpleIcon from www.flaticon.com

Google Scholar icon made by Freepik from www.flaticon.com

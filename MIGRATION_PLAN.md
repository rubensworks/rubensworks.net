# Migrating rubensworks.net from Jekyll to Astro

**Status:** proposal · **Goal:** identical rendered output, same input files, much faster builds

---

## 1. Recommendation in one paragraph

Migrate to **Astro 7** (TypeScript, static output via `astro build`), and replace
`jekyll-scholar` with a small owned TypeScript module that parses
`_bibliography/references.bib` **once** per build. Keep every input file exactly where it
is: `_bibliography/references.bib`, `_data/*.yml`, `_posts/*.markdown`, `_projects/*.html`,
`_sass/*.scss`. Only the Liquid templates (`_layouts/`, `_includes/`) get rewritten — they
have to change under any option, for reasons explained in §4. Expected build time drops
from tens of seconds to low single-digit seconds, and the toolchain stops being pinned to
an end-of-life runtime.

**Runner-up:** Eleventy 3. It is a closer 1:1 analogue of Jekyll and would be a defensible
choice — §4.3 explains exactly when it would win instead.

---

## 2. Why the current build is slow

This is not "Ruby is slow". It is a specific, measurable architectural problem in
`jekyll-scholar`, confirmed by reading the installed gem source
(`jekyll-scholar-5.16.0/lib/jekyll/scholar/utilities.rb`).

### 2.1 The 160 KB bibliography is parsed 26 times

`Scholar::Utilities#bibliography` (utilities.rb:166) memoises the parsed bibliography in
`@bibliography` — an **instance** variable. Every `{% bibliography %}` and
`{% bibliography_count %}` tag is a separate `Liquid::Tag` object with its own
`@config = Scholar.defaults.dup` and its own `@bibliography`. So each tag re-reads and
re-parses the whole file from scratch with the yacc-based `bibtex-ruby` parser, then
re-runs `replace_strings` and `join`.

| Location | `{% bibliography %}` | `{% bibliography_count %}` |
|---|---|---|
| `index.html` | 2 | 0 |
| `publications.md` | 1 | 0 |
| `cv.md` | 11 | 11 |
| **Total tag instances** | **14** | **11** |

Plus one more parse in `DetailsGenerator#generate`. **26 full parses of a 160 KB / 92-entry
BibTeX file per build.**

### 2.2 Every bibliography entry is rendered through Liquid twice

`bibliography_tag` (utilities.rb:483) renders the `bib.html` template, then does
`Liquid::Template.parse(tmp).render(...)` **on its own output** — a second full parse and
render per entry. Both passes call `.merge(site.site_payload)`, which materialises the
entire site object (all pages, all posts, all `_data`) for each individual entry.

Across the publications page (92), `cv.md`'s eleven queries (~90), and the homepage (8),
that is roughly **190 in-page entry renders**, each doing two Liquid parses and a full
site-payload merge.

### 2.3 92 extra pages are generated one at a time

`DetailsGenerator` builds a `Details` page per entry and calls `render` + `write`
individually, each walking the `bibtex.html` → `default.html` layout chain with the full
`site_payload`. That is 92 of the site's ~121 output pages.

### 2.4 The toolchain is permanently frozen on Ruby 2.7

`bibtex-ruby` 4.4.7 contains `data.each(&Proc.new)` (`bibliography.rb:150`). Calling
`Proc.new` without a block was **removed in Ruby 3.0**, so the pinned dependency set cannot
run on any Ruby ≥ 3.0. Verified in this repo: installing the stack on Ruby 3.3.6 fails at
build time with `tried to create Proc object without a block`. `jekyll-scholar` 5.16.0
requires `bibtex-ruby ~> 4.0`, so there is no in-place upgrade path.

`.ruby-version` pins 2.7.8; Ruby 2.7 reached end-of-life on **31 March 2023**. The CI
workflow also installs `libxml2-dev`/`libxslt-dev` and builds Nokogiri from source on every
run. This is the strongest argument for migrating rather than optimising in place: the
current setup is not merely slow, it is unmaintainable.

---

## 3. What must be preserved

### 3.1 Input files — unchanged, still consumed as-is

| Input | Count / size | Notes |
|---|---|---|
| `_bibliography/references.bib` | 92 entries, 160 KB | Read in place. Literal UTF-8 (`Klíma`, `Nečaský`, curly apostrophes) **and 10 LaTeX accent escapes** (`{\'a}`×4, `{\'e}`×4, `\'{a}`×2) across 6 entries — see §6.2 |
| `_data/knows.yml` | 77 co-author entries | Author → `{url, foaf}` lookup |
| `_data/presentations.yml` | 81 presentations | |
| `_data/studentsphd.yml`, `_data/studentsmaster.yml` | | Used by `cv.md` |
| `_posts/*.markdown` | 6 posts | Astro natively supports the `.markdown` extension (verified in `astro@7.2.2`: `SUPPORTED_MARKDOWN_FILE_EXTENSIONS`) — **no renaming needed** |
| `_projects/*.html` | 11 projects | Front matter + HTML body; read via a thin custom loader so files stay untouched |
| `_sass/*.scss`, `css/main.scss` | 4 partials | Compiled by `sass` |
| `img/**`, `ads.txt`, `.well-known/nostr.json` | 61 images, 12 MB | Static passthrough |

### 3.2 URLs — every one of these must keep working

- `/`, `/about/`, `/blog/`, `/projects/`, `/old-projects/`, `/publications/`,
  `/presentations/`, `/contact/`, `/cv/`, `/reading_list/`, `/research_goals/`,
  `/application-swsa-distinguished-dissertation-award-2020/`
- `/blog/:year/:month/:day/:slug/` — 6 posts (`permalink: pretty` + `categories: blog`)
- `/projects/:name/` — 11 projects
- `/publications/:key/` — **92 pages**. Key transform is
  `entry.key.gsub(/[:\s]+/, '_')` (`details_permalink: /:details_dir/:key:extension`).
  No current key contains `:` or whitespace, so keys pass through unchanged.
- `/css/main.css`, `/feed.xml`, `/ads.txt`, `/img/**`

### 3.3 The embedded Linked Data — a hard requirement, not cosmetic

This site publishes RDFa **and** microdata: `foaf:`, `schema.org`, `bibframe:`, `vivo:`,
`org:`, `cert:`, `owl:`, plus a JSON-LD `foaf:knows` block on the homepage and the
`cert:RSAPublicKey` modulus in `header.html`. Attributes like `property`, `typeof`, `about`,
`resource`, `rel`, `datatype`, `itemprop`, `itemscope`, `itemtype` and the `prefix`
declarations on `<html>`/`<head>`/`<body>` must survive byte-for-byte in meaning.

"Looks identical to visitors" therefore has a second half: **the extracted RDF graph must be
unchanged**. §7.3 makes that a mechanical check rather than a hope.

---

## 4. Framework choice

### 4.1 Requirements

1. Static HTML output, no client-side runtime imposed.
2. Byte-level control of the emitted markup (the RDFa/microdata requirement).
3. Consumes Markdown + front matter, YAML data, SCSS, and arbitrary custom build logic
   (the BibTeX pipeline).
4. JavaScript/TypeScript.
5. Fast, and likely to still be maintained in five years.

This rules out Next.js / Nuxt / Docusaurus / VitePress: they ship a hydration runtime
and/or an opinionated theme layer, both of which fight requirement 2. It rules out Hugo on
requirement 4. The real choice is **Astro** vs **Eleventy**.

### 4.2 Astro 7 — recommended

- **Zero JS by default.** `.astro` components compile to plain HTML at build time; nothing
  is injected unless you add a `client:*` directive. Full control over every attribute.
- **TypeScript-first.** Content collections with Zod schemas mean the 92 BibTeX entries and
  4 YAML files get validated and typed at build time. For a site whose whole risk profile
  is "did the bibliography render correctly", this is the single most valuable property.
- **The bibliography becomes ordinary code.** A ~200-line TS module replaces
  `jekyll-scholar`: parse once, sort once, expose typed query helpers, unit-test it. This
  is what actually fixes §2.1–2.3.
- **`getStaticPaths`** is a natural fit for the 92 `/publications/:key/` pages.
- **SCSS** works via Vite with `npm i -D sass`.
- **Native `.markdown` support** — `_posts/` is consumed with no renaming.
- **Ecosystem momentum.** The current pain came from an under-maintained plugin on a dead
  runtime; picking the most actively maintained option is a direct mitigation.

Cost: all 6 layouts and 15 includes are rewritten as `.astro` components. They are small —
most includes are 10–20 lines — and §4.4 explains why they can't be preserved anyway.

### 4.3 Eleventy 3 — the alternative, and when to pick it

Eleventy supports Liquid as a first-class template language, has a `_data` global-data
directory, and maps front matter, collections and permalinks closely to Jekyll. It is also
the fastest option in absolute terms at this scale.

**Pick Eleventy instead if** minimising template churn is worth more than typed content and
you want the smallest possible reviewable diff.

**Why it does not win here:**
- Its Liquid is LiquidJS, not Ruby Liquid. `{% include foo.html key=value %}` — used 56
  times in `cv.md` alone, plus `post-listing.html` and `presentations.html` — uses different
  syntax in LiquidJS (`{% render %}` / `{% include x, k: v %}`). The includes get rewritten
  regardless.
- Jekyll's filter set (`markdownify`, `date_to_xmlschema`, `date_to_rfc822`, `xml_escape`,
  `slugify`, `truncatewords`, `strip_html`, `newline_to_br`) needs hand-written shims.
- `site.posts` / `site.pages` / `site.data` / `page.excerpt` all need remapping.
- Configuration is JS, not TS; the bibliography stays untyped.

So the "reuse the Liquid templates unchanged" advantage is largely illusory, and Astro's
typing advantage is real. Astro wins on balance.

### 4.4 Why the templates change under either choice

`_includes/*.html` rely on Jekyll's parameterised-include convention plus Jekyll-specific
filters and globals. No JS framework reproduces that combination. Since the user has
already accepted that "the jekyll-specific template files can of course change", this is
budgeted work, not a regression.

### 4.5 Dependencies — chosen for maintenance health, not just capability

Astro is a plain npm dependency (`npm i astro`); nothing is installed globally and
`astro build` emits a static `dist/`.

**Popularity caveat:** npm download counts come from `api.npmjs.org`, which this
environment's egress policy blocks (403). The figures below are maintenance signals read
from `registry.npmjs.org` instead — release cadence, package age, maintainer count. Confirm
download numbers on npmjs.com before committing if that matters to you.

Astro 7 has a **much larger built-in surface than expected**, so most markdown plugins I
would otherwise have added are unnecessary. Verified by probing a real build (§4.9). The
actual direct dependency list is small:

| Package | Version | Last publish | Releases/12m | Maintainers | Assessment |
|---|---|---|---|---|---|
| `astro` | 7.2.2 | 4 d | **148** | 2 | Very active. MIT, `withastro/astro` |
| `sass` | 1.102.0 | 24 d | 28 | 2 | Official Dart Sass. Healthy |
| `@retorquere/bibtex-parser` | 10.0.1 | 6 d | 7 | **1** | Active (264 versions over 7 y); parser behind Better BibTeX for Zotero. **Bus factor 1** — see below |
| `yaml` | 2.9.0 | 98 d | 7 | **1** | 15 years old, ubiquitous, stable. Low risk despite one maintainer |
| `vitest` *(dev)* | 4.1.10 | 42 d | 59 | 5 | Very active |
| `playwright` *(dev)* | 1.62.1 | 18 d | **575** | 5 | Microsoft, Apache-2.0 |
| `linkinator` *(dev)* | 8.0.4 | 1 d | 25 | 1 | Active; one maintainer but trivially replaceable |
| `rdf-parse` *(dev)* | 5.0.0 | 220 d | 1 | 1 | **Your own package** |
| `rdf-isomorphic` *(dev)* | 2.0.1 | 564 d | 0 | 1 | **Your own package** |

Four runtime dependencies, five dev. Everything else comes through Astro.

**Dropped from the earlier draft, because Astro 7 already provides it** (all verified in
§4.9): `remark-smartypants`, `rehype-slug`, `github-slugger`, `shiki`, `@shikijs/rehype`,
`unified`, `rehype-raw`.

**Rejected on maintenance grounds:** `remark-attr` — last published **2293 days ago**
(6.3 years), one maintainer, zero releases in 24 months. Effectively abandoned; do not use
it for the inline-attribute-list work. A hand-written ~20-line remark plugin is both smaller
and safer.

**On the single-maintainer packages.** Bus factor 1 matters less here than it looks, because
every one of them is a *build-time* dependency: nothing ships to visitors, and a failure mode
is "the build breaks and you notice", not "the site is compromised at runtime". Specifically:

- `@retorquere/bibtex-parser` is the only one on the critical path. It is genuinely active
  (published 6 days ago) and backs a widely-used Zotero plugin. It is isolated behind
  `lib/bibliography.ts`, and its output is pinned by the §7.6 snapshots, so a replacement
  would touch one file and be caught immediately by tests.
- The `rdf-*` packages are yours; their low release cadence reflects finished software, and
  you are the maintainer.
- The unified/rehype ecosystem packages (`github-slugger` last published 1390 days ago,
  `unified` 789 days) look stale by cadence but are deliberately "done" software with very
  large dependent trees — and they now arrive transitively via Astro, so they are Astro's
  problem to keep current, not a direct dependency decision.

### 4.6 BibTeX parser: `@retorquere/bibtex-parser`, not citation-js

Both were run against the real `references.bib`:

| | `@retorquere/bibtex-parser` | `citation-js` + `@citation-js/plugin-bibtex` |
|---|---|---|
| Entries parsed | 92, zero errors | 92 |
| Parse time (once per build) | 759 ms | 52 ms |
| Custom `_`-prefixed fields | **All preserved** (`_type`, `_highlighted`, `_slides`, `_poster`, `_video`) | **Dropped** — normalises to CSL-JSON |
| LaTeX accents | Decoded (`Gal{\'a}rraga` → `Galárraga`) | Decoded |
| Name particles | Grouped into `lastName` | Split into `non-dropping-particle` |

**citation-js is disqualified.** Its CSL-JSON normalisation keeps only standard fields, so
`_type` (which drives all eleven `cv.md` categories) and `_highlighted` (which drives the
homepage) survive only inside an opaque `_graph` provenance blob. Verified: an entry's keys
come back as `URL, _graph, abstract, author, citation-key, container-title, id, issued,
title, type`.

`@retorquere/bibtex-parser` (the parser behind Better BibTeX for Zotero) returns every field
verbatim. Its 759 ms is irrelevant because it runs **once**, versus jekyll-scholar's 26
parses.

### 4.7 Three parser/framework defaults that silently break fidelity

All three were found by building the spike (§7.7) — none are obvious from documentation, and
each produces plausible-looking but wrong output.

1. **`sentenceCase` defaults to ON** in `@retorquere/bibtex-parser`. It is Better-BibTeX
   behaviour for Zotero and it rewrites `Proceedings of the 25th International Semantic Web
   Conference` to `...international semantic web conference`. This would visibly corrupt the
   `booktitle`/`journal` line of **all 92 entries** and titles such as `Traqula: Providing a
   Foundation for The Evolving SPARQL Ecosystem...`. Jekyll never touches title casing.
   **Always pass `{ sentenceCase: false }`.**
2. **LaTeX accents decode to NFD, not NFC.** `Gal{\'a}rraga` becomes `Gala\u0301rraga`
   (combining acute), whereas Ruby's `latex-decode` and `_data/knows.yml` use precomposed
   `\u00e1`. The strings render identically but compare unequal, so the `knows.yml` lookup
   fails and the `<a class="author">` link plus its `foaf:maker` / `schema:creator` /
   `schema:author` RDFa triples are silently dropped. Both affected people — Luis Galárraga
   and Julián Andrés Rojas Meléndez — *are* in `knows.yml`, across 6 entries.
   **Normalise every parsed string with `.normalize('NFC')`.**
3. **Astro's `compressHTML` defaults to ON**, minifying output onto one line and making the
   §7.2 byte/DOM diff far harder to read. **Set `compressHTML: false`** at least until the
   diff is clean.

### 4.8 The one real maintenance risk: Astro 7's markdown engine is brand new

Astro 7 replaced the long-standing remark/rehype pipeline (`@astrojs/markdown-remark`) with
`@astrojs/markdown-satteri`, built on `satteri` — a Rust-backed Markdown/MDX processor.

| Package | Version | First published | Age | Maintainers |
|---|---|---|---|---|
| `satteri` | 0.9.5 | 2026-04-05 | **134 days** | **1** |
| `@astrojs/markdown-satteri` | 0.3.5 | 2026-05-28 | **81 days** | 2 |
| `@astrojs/markdown-remark` | 7.2.2 | 2021-09-21 | 4.9 years | 2 |

Astro's default markdown engine is a **four-month-old, pre-1.0, single-maintainer package**.
That deserves attention here specifically because markdown fidelity is this migration's
largest remaining risk (22 `markdown="block"` sites, 7 IALs, kramdown compatibility).

Mitigating facts, all verified in §4.9 rather than assumed:

- `remarkPlugins`, `rehypePlugins` and `remarkRehype` are still first-class config options
  and are **not** deprecated; only `gfm` and `smartypants` are (the processor now owns those
  defaults).
- A custom remark plugin **does run** under satteri — it consumes standard mdast.
- Smart typography already matches kramdown out of the box.
- `@astrojs/markdown-remark` is still actively published (last release 2026-07-28) and
  `markdown.processor` is a pluggable slot defaulting to `satteri()`, so the mature remark
  pipeline remains available as a fallback.

**Recommendation:** proceed on the default (satteri), because the §4.9 probe shows it behaves
correctly and the plugin API we depend on is intact. If Phase 5 hits a satteri-specific
markdown bug, the escape hatch is to set `markdown.processor` back to the remark
implementation, or pin Astro 6.x — decide that *if* it happens rather than pre-emptively.

### 4.9 What a real Astro 7 build actually does with kramdown constructs

A probe page containing the exact constructs used by this site was built and the output
inspected. Results, which reshape §6.4 and §6.7:

| Construct | Astro 7 default behaviour | Verdict |
|---|---|---|
| `---` / `--` / `"..."` / `...` / `'` | → `—` `–` `“…”` `…` `’` | **Matches kramdown. No plugin needed** |
| Heading IDs | auto-generated: `## Why JSON-LD parsing is hard` → `id="why-json-ld-parsing-is-hard"` | Built in. But kramdown yields `jsonld`, not `json-ld` — the §6.4.3 slug difference is **real and confirmed** |
| `{:.cv-biography}` (IAL) | **leaks verbatim** into the paragraph text | Needs the custom plugin (§6.4.2) |
| `markdown="block"` | **partially processed** — see below | Needs the custom plugin (§6.4.1) |
| Fenced code block | Shiki with **inline styles**, theme `github-dark`: `<pre class="astro-code github-dark" style="background-color:#24292e;...">` | Completely unlike the current light Rouge/Pygments classes — confirms §6.7 is real work |

The `markdown="block"` result is worse than a clean failure. CommonMark terminates the raw
HTML block at the first blank line, so content is **inconsistently** handled:

```html
<figure id="jsonld-recipe-mojito" class="listing" markdown="block">
This **markdown inside a raw HTML block** must be processed by kramdown.   <!-- ** stayed literal -->
<ul><li>list item one</li></ul>                                           <!-- but this converted -->
<p><a href="https://example.org/">A link</a></p>                           <!-- and so did this -->
</figure>
```

The first line stays raw while everything after the blank line is parsed as markdown. That
renders as *mostly* correct output with stray `**` markers — the kind of thing that survives
a skim review. Treat the 22 occurrences as must-fix, and give each one a fixture test.


---

## 5. Target layout

```
astro.config.mjs
package.json
tsconfig.json

_bibliography/references.bib     # unchanged
_data/*.yml                      # unchanged
_posts/*.markdown                # unchanged
_projects/*.html                 # unchanged
_sass/*.scss                     # unchanged (minus the `/` division fix, §6.6)
css/main.scss                    # unchanged

src/
  site.config.ts                 # former _config.yml values
  content.config.ts              # collections: posts, projects, publications
  lib/
    bibliography.ts              # parse .bib ONCE; sort; group
    bibquery.ts                  # the 5 query operators (§6.1)
    authors.ts                   # display-name rule + knows.yml lookup (§6.2)
    excerpt.ts                   # <!--more--> + truncatewords(30) (§6.5)
    slug.ts                      # kramdown-compatible heading slugs (§6.4)
  components/                    # from _includes/
    Head.astro Header.astro Footer.astro GoogleAnalytics.astro
    SocialIcon.astro PostListing.astro BibEntry.astro BibList.astro
    Presentations.astro CvListing.astro Book.astro
    MinecraftMod.astro RdfjsSoftware.astro
  layouts/                       # from _layouts/
    Default.astro Page.astro Post.astro Project.astro PublicationDetail.astro
  pages/
    index.astro
    about.astro contact.md cv.astro reading_list.astro research_goals.md
    application-swsa-distinguished-dissertation-award-2020.md
    blog/index.astro
    blog/[...slug].astro         # /blog/yyyy/mm/dd/slug/
    projects/index.astro projects/[slug].astro
    old-projects.astro
    publications/index.astro
    publications/[key].astro     # 92 pages via getStaticPaths
    presentations.astro
    feed.xml.ts

public/
  img/** ads.txt .well-known/nostr.json
  css/main.css                   # emitted by the prebuild sass step (§6.6)
```

`_projects/*.html` are loaded with a small custom Content Layer loader that splits front
matter and hands the body through as raw HTML, so the source files stay byte-identical.

---

## 6. Replacing jekyll-scholar and closing the fidelity gaps

Each item below is a concrete, bounded task with the exact semantics already extracted from
the gem source or verified against the real data.

### 6.1 The BibTeX query DSL — 5 operators, fully specified

`cv.md` and `index.html` use `--query` expressions. `bibtex-ruby`'s implementation
(`elements.rb:195–232`) reduces to this, where `actual` is the field's `to_s`:

| Operator | Semantics |
|---|---|
| `=` (default) | `actual.to_s == value` — exact string equality |
| `^=` | `actual.to_s.match("^" + value)` — regex anchored at start |
| `~=` | `actual.to_s.match(value)` — unanchored regex search |
| `!~` | field absent, **or** no regex match |
| `!=`, `/=` | field absent, **or** `!=` |

`&&` combines conditions. The expressions actually used:

- `@*[_highlighted=true]` — homepage highlights (3 entries)
- `@*[_type=Journal]`, `…=Conference`, `Workshop`, `Demo`, `Poster`, `Challenge`,
  `Tutorial`, `PhD Symposium`, `Blue Sky`, `Position Statement`, `Master's Thesis`
- `@*[author ^= Taelman]` — first author
- `@*[author ~= Ruben$ && author !~ Verborgh]` — last author, excluding one name
- `@*[author !~ Verborgh]`

**Critical detail:** for `author`, `actual` is `BibTeX::Names#to_s`, i.e. the normalised
`"Last, First and Last, First"` string. That is what makes `^= Taelman` mean "first author"
and `~= Ruben$` mean "last author". The TS port must match against that same normalised
string, not against a parsed array.

All 92 entries use the `Last, First and …` form. The file *does* contain LaTeX accent
escapes (§6.2), so decode before matching — and assert the normalised form rather than
assuming it.

### 6.2 Author display names — exact rule, verified against all 88 authors

`bib.html` builds each name as `{{ first }} {{ prefix }} {{ last }}` with `"  " → " "`,
then looks the result up in `_data/knows.yml`. `prefix` is `BibTeX::Name`'s von-particle
field, produced by the `namae` gem — heuristics we do **not** want to reimplement.

We don't have to. Running the real parser over the real file (all 88 distinct authors)
shows the reconstruction is always identical to simply concatenating the given name with
the verbatim pre-comma family field:

| BibTeX | `first` / `prefix` / `last` | Rendered |
|---|---|---|
| `Van de Vyvere, Brecht` | Brecht / `Van de` / Vyvere | Brecht Van de Vyvere |
| `Mendes de Farias, Tarcisio` | Tarcisio / `Mendes de` / Farias | Tarcisio Mendes de Farias |
| `de Valk, Sjors` | Sjors / `de` / Valk | Sjors de Valk |
| `De Meester, Ben` | Ben / — / De Meester | Ben De Meester |

So the rule is:

```ts
displayName = `${given} ${familyFieldVerbatim}`
```

This removes the largest fidelity risk in the whole migration.

Two caveats, both verified and both covered by tests in §7.6:

- **Decode LaTeX first.** 6 of the 92 entries carry accent escapes; `bib.html` receives
  values already passed through jekyll-scholar's `bibtex_filters`
  (`[:smallcaps, :superscript, :italics, :latex]`), so production renders `Luis Galárraga`,
  not `Luis Gal{\'a}rraga`. `@retorquere/bibtex-parser` decodes these natively.
  (This could not be executed end-to-end here — `Names#convert!` is another Ruby-3
  incompatibility in `bibtex-ruby` 4.4.7 — so confirm the 6 names against the golden
  baseline in Phase 0.)
- **Normalise to NFC**, per §4.7.2, or the `knows.yml` lookup fails for exactly those names.

**Guard it with a build-time assertion**: every author name must either match a `knows.yml` key or appear in an explicit
allowlist of known-unlinked authors, so a future name-parsing regression fails the build
instead of silently dropping an `<a class="author">` and its RDFa triples.

### 6.3 Sorting, grouping, and the rest of the scholar surface

- **Sort:** `sort_by: year,month` with `order: descending`. `sort_keys` maps `month` →
  `month_numeric` (utilities.rb:218). `month_numeric` comes from `bibtex-ruby`'s
  `parse_months` — verified: `october`→10, `sep`→9, `jun`→6, etc. 91 of 92 entries have a
  `month`; `dimou_ekaw_workshop_2016` does not and must sort as an empty value, last within
  its year.
- **Grouping:** `--group_by year --group_order descending` emits, per group,
  `<h2 class="bibliography">YEAR</h2>` followed by the entry list. The `h2` comes from
  `bibliography_group_tag: 'h2,h3,h4,h5'` taking the first level.
- **List markup:** `<ol class="bibliography">` wrapping `<li>` per entry
  (`bibliography_list_tag: ol`, `bibliography_item_tag: li`).
- **Details link:** each entry gets
  `<a href="/publications/KEY" class="details">More</a>` appended
  (`details_link: More` from `_config.yml`, `details_link_class` defaults to `details`).
- **`--max 5` / offset:** slice after sorting.
- **`entry.bibtex`:** the entry re-serialised with `bibtex_skip_fields` removed
  (`abstract`, `month_numeric`, `_type`, `_slides`, `_poster`, `_video`, `_highlighted`) and
  `bibtex_quotes: ['{','}']`. Reproduce the field order and `{}` quoting of
  `BibTeX::Entry#to_s`, since it is displayed verbatim in the `<pre class="bibtex content">`
  block on all 92 detail pages.
- **`bibliography_count`:** the length of the filtered set, rendered inline.

### 6.4 Markdown: kramdown → remark

Four real incompatibilities, all bounded:

1. **`markdown="block"` — 22 occurrences** across 6 posts (17 in
   `2019-03-13-streaming-rdf-parsers`, 7 in
   `2026-04-13-did-ai-clawlers-kill-sparql-federation`, plus one each in four others),
   mostly on `<figure id="…" class="listing">`. Kramdown processes Markdown *inside* raw
   HTML blocks when this attribute is present; remark/CommonMark does not. Fix with a small
   remark plugin that honours the attribute, or restructure those 22 blocks. **This is the
   largest single markdown task.**
2. **Inline attribute lists — 7 occurrences.** `{:.cv-biography}`, `{:.cv-listing}` ×3,
   `{:.demo-nodejs}` ×2, `{:#demo-nodejs-preamble .hide}`. All block-level; handle with a
   remark attributes plugin or convert to explicit wrappers.
3. **Heading IDs.** Astro generates these automatically via `github-slugger`, so no plugin
   is needed — but the algorithm differs from kramdown's `auto_ids` on strings like
   `JSON-LD` (kramdown → `jsonld`, github-slugger → `json-ld`), **confirmed by build probe
   in §4.9**. Audited: the only
   auto-ID-dependent in-page anchors are the four in `research_goals.md`
   (`#research`, `#development`,
   `#enhancing-link-traversal-based-query-execution`,
   `#querying-over-decentralized-data-on-the-web`) and these slugify **identically** under
   both. The `#jsonld-recipe-mojito*` anchors point at explicit `id=` attributes on
   `<figure>` elements, not headings. Low risk — but §7.4 makes it a checked invariant.
4. **Smart typography.** ~~Enable `remark-smartypants`.~~ **No longer needed** — Astro 7's
   processor does this by default and the output matches kramdown (§4.9). Just diff to
   confirm; do not add a dependency.

Also: fenced code blocks use `javascript` (21), `sparql` (3), `json` (2). There are no
`{% highlight %}` Liquid tags, so all highlighting goes through the markdown pipeline.

### 6.5 Excerpts

`excerpt_separator: <!--more-->`, used in all 6 posts. Excerpts appear in two places:

- `post-listing.html` renders `{{ post.excerpt }}` (rendered HTML) on `/` and `/blog/`.
- `head.html` derives `<meta name="description">` and the OG/Twitter descriptions from
  `page.excerpt | newline_to_br | strip_newlines | replace: '<br />', ' ' | strip_html |
  strip | truncatewords: 30`. Note Liquid's `truncatewords` appends `…`. Non-post pages
  have no excerpt and fall back to `site.description` — replicate that branch exactly.

### 6.6 SCSS and the `main.css` URL

- 23 uses of legacy `/` division (`$spacing-unit / 2`, `$rw-icon-size / 2 + 4`) and 12 uses
  of `lighten()`/`darken()`. Modern `sass` (1.102) still accepts these but warns; convert
  to `math.div` / `color.adjust` as a mechanical fix.
- `@extend %clearfix`, `%vertical-rhythm` and the `media-query` mixin all work unchanged.
- **`css/main.scss` opens with a Jekyll front-matter fence** (`---` / comment / `---`) whose
  only purpose was to trigger Jekyll's sass converter. `sass` fails on it with
  `Error: expected "{"`. Delete those three lines — the one unavoidable edit to the SCSS
  inputs.
- **Keep the output at `/css/main.css`.** Add a prebuild step
  (`sass css/main.scss public/css/main.css --load-path=_sass`) rather than letting Astro
  bundle and hash the stylesheet. Astro's hashed filename would work fine for visitors, but
  a stable path keeps `<link rel="stylesheet" href="/css/main.css" />` byte-identical, which
  keeps the §7.2 HTML diff free of noise. Switch to hashed bundling later if desired.

### 6.7 Syntax highlighting — the one genuine pixel risk

`_sass/_syntax-highlighting.scss` styles ~50 **Rouge/Pygments** token classes (`.k`, `.nt`,
`.s`, `.na`, `.gd .x`, …) under `.highlight`. No JS highlighter emits those class names:
Shiki uses inline styles, Prism and starry-night use their own vocabularies.

Verified in §4.9: Astro's out-of-the-box output is a **dark** theme with inline styles —
`<pre class="astro-code github-dark" style="background-color:#24292e;color:#e1e4e8">` — so
doing nothing is not an option; the current site's code blocks are light. Configure this
through `markdown.shikiConfig`; Shiki ships with Astro, so no extra dependency.

Options, in order of preference:

1. **Shiki with a custom theme derived from the existing SCSS.** The current palette is the
   classic Rouge *github* theme — a handful of distinct colours (`#998` italic comments,
   bold keywords, `#a61717` on `#e3d2d2` errors, `#099` strings, …). Port those token
   colours into a Shiki theme, emit inline styles, and retire
   `_syntax-highlighting.scss`. Visually equivalent without needing class-name parity.
2. Post-process Shiki's output to re-emit Pygments class names and keep the SCSS untouched —
   higher fidelity, more machinery.

Either way, verify by rendering all 26 code blocks before and after and comparing
screenshots (§7.5). This is the only place where "identical" needs judgement rather than a
diff.

### 6.8 Two latent issues worth fixing while we are here

- **`.well-known/nostr.json` is not currently published.** Jekyll excludes dot-prefixed
  paths (`configuration.rb:20` sets `include => ['.htaccess']` only, and `EntryFilter`
  treats a leading `.` as special), so the NIP-05 identity file never reaches `_site`, and
  the deploy is `rsync -r _site/*`. In Astro, `public/.well-known/nostr.json` **will** be
  published. That is almost certainly the desired behaviour — flagging it because it is a
  deliberate behaviour change, not an accident.
- **CI does not fail on broken links.** `script/cibuild` ends `htmlproofer … || true`, so
  link-check failures are currently swallowed. Worth making the replacement check blocking
  (§7.4).

---

## 7. Verification strategy

This is the part that actually delivers "identical to visitors". The migration is only as
trustworthy as the diff.

### 7.1 Capture a golden baseline first — before touching anything

The current stack **cannot** build on modern Ruby (§2.4), so pin the old runtime in a
container:

```bash
docker run --rm -v "$PWD":/src -w /src ruby:2.7 \
  bash -c 'bundle install && bundle exec jekyll build -d /src/_site_golden'
```

Commit nothing from `_site_golden`; keep it as a local reference tree. (Note: this could not
be produced inside the sandbox used to write this plan — network egress to
`www.rubensworks.net` is blocked there and Ruby 2.7 was unavailable, so the baseline capture
is the first hands-on step.) A `wget --mirror` of production is an acceptable fallback.

### 7.2 Structural HTML diff, page by page

1. Compare the two file trees — any missing or extra path is a bug (expect exactly one
   intentional addition: `.well-known/nostr.json`, §6.8).
2. For each of the ~121 HTML files, parse both sides and compare DOM-wise (normalising
   insignificant whitespace and attribute order) rather than with `diff`, so real
   differences are not buried in formatting noise.
3. Drive this to **zero unexplained differences**, with every remaining difference
   explicitly listed and justified.

### 7.3 RDF graph equivalence — the check that matters most here

Because the site's Linked Data is a first-class output (§3.3), extract RDF from every page
on both sides and compare the graphs, not the markup:

- Parse each HTML file with an RDFa/microdata-capable parser (`rdf-parse` /
  `rdfa-streaming-parser` — conveniently, in-house tooling).
- Canonicalise to sorted N-Quads and compare per page.
- **Zero triple differences** across all 121 pages is the acceptance criterion.

This catches exactly the failure mode that a screenshot comparison would miss: a dropped
`property=` or a mangled `resource=` that changes the published graph while looking fine.

### 7.4 Link and anchor integrity

Replace the (currently non-blocking) `html-proofer` step with a JS equivalent, and make it
**fail the build**. Minimum coverage: every internal link resolves to a generated page, and
every in-page `#anchor` resolves to an element with that `id` — the specific guard for the
kramdown-slug risk in §6.4.3.

### 7.5 Visual regression — Playwright screenshots

`playwright` 1.62.1 against Chromium. Serve `_site_golden` and `dist/` on two ports and shoot
the same page list on both, then compare per pixel.

**Page list** (covers every layout and every include):

| Page | Why |
|---|---|
| `/` | `default` layout, JSON-LD block, 2 post listings, 2 bibliography queries |
| `/publications/` | grouped bibliography, 92 entries |
| `/publications/taelman_iswc_resources_comunica_2018/` | `bibtex` layout, `<pre>` BibTeX block |
| `/cv/` | 11 bibliography + 11 count tags, `cv-listing` include, 3 IALs |
| `/presentations/` | `presentations` include over 81 YAML entries |
| `/blog/` + `/blog/2019/03/13/streaming-rdf-parsers/` | `post` layout, 17 `markdown="block"`, 21 code blocks |
| `/projects/` + `/projects/comunica/` | `project` layout, collection sort |
| `/reading_list/` | 28 `book` includes |
| `/research_goals/` | auto-generated heading IDs |

**Viewports:** 1280 px, 800 px (`$on-laptop`) and 560 px (`$on-palm`) — `_layout.scss` has
breakpoint rules at both. `deviceScaleFactor: 2`. Plus one run with `media: 'print'` to
exercise `_print.scss`, and the dedicated 26-code-block sheet from §6.7.

**Harness notes learned from the spike:**

- Chromium is preinstalled; pass
  `executablePath: '/opt/pw-browsers/chromium-<build>/chrome-linux/chrome'` rather than
  running `playwright install`.
- Block or stub `fonts.googleapis.com` **on both sides** so a network hiccup cannot show up
  as a font-metric diff. `head.html` loads Open Sans and Droid Sans remotely; if the CI
  runner cannot reach Google Fonts the screenshots fall back to different metrics and every
  text comparison fails spuriously. (This is exactly what happened in the sandbox used to
  write this plan.)
- Wait on `networkidle`, and mask nothing — the point is to catch layout drift.

### 7.6 Unit tests — vitest

The bibliography engine is pure TypeScript with no Astro dependency, so it is testable in
isolation. **A working 28-test suite already exists and passes** — see
`migration-reference/` in this repo (§7.7). Coverage:

**Parsing (3 tests)**
- all 92 entries parse with zero errors
- the custom `_`-prefixed fields survive (`_type`, `_highlighted`; 3 highlighted entries) —
  the regression that disqualified citation-js
- every `_type` value used by `cv.md` exists: Journal, Conference, Workshop, Demo, Poster,
  Challenge, Tutorial, PhD Symposium, Blue Sky, Position Statement, Master's Thesis

**Author display names (9 tests)**
- the 6 von-particle cases render as jekyll-scholar renders them
  (`Van de Vyvere, Brecht` → `Brecht Van de Vyvere`, `Mendes de Farias, Tarcisio` →
  `Tarcisio Mendes de Farias`, `de Valk, Sjors` → `Sjors de Valk`, …)
- LaTeX accents decode **and** no raw `\`, `{`, `}` leaks into any name
- exactly 88 distinct authors
- every author resolves in `knows.yml` or a snapshotted allowlist — currently 12 legitimately
  unlinked names, so any name-parsing regression changes the snapshot and fails the build

**Sorting and grouping (5 tests)**
- year descending, then month descending, checked pairwise across all 92
- `monthToNumber` matches bibtex-ruby's `:parse_months` (`october`→10, `oct`→10, `June`→6,
  `undefined`→null)
- `dimou_ekaw_workshop_2016` (the one entry with no `month`) sorts last within 2016
- year groups are descending and partition all 92 entries
- **the full 92-key entry order is snapshotted** — the single most valuable fixture, since it
  pins the exact publications-page ordering

**Query operators (9 tests)**
- one test per operator (`=`, `^=`, `~=`, `!~`, `!=`) against the semantics in
  `elements.rb:195-232`
- all 16 `--query` expressions used across the site, counts snapshotted:

  ```
  @*                                          92     @*[_type=Poster]              10
  @*[_highlighted=true]                        3     @*[_type=Tutorial]             1
  @*[_type=Journal]                           11     @*[_type=Challenge]            1
  @*[_type=Conference]                        22     @*[_type=PhD Symposium]        1
  @*[_type=Workshop]                          23     @*[_type=Blue Sky]             1
  @*[_type=Demo]                              18     @*[_type=Position Statement]   1
  @*[author ^= Taelman]                       37     @*[_type=Master's Thesis]      1
  @*[author !~ Verborgh]                      37
  @*[author ~= Ruben$ && author !~ Verborgh]   19
  ```

  These must equal the golden `{% bibliography_count %}` output. Note `cv.md` renders the
  last-author count as `19 | plus: 3` = 22.
- semantic assertions: `^= Taelman` really does select first-authored papers;
  `~= Ruben$` really does select last-authored ones
- unsupported query syntax throws rather than silently matching nothing

**Title casing (2 tests)** — regression guards for §4.7.1
- `booktitle` stays `Proceedings of the 25th International Semantic Web Conference`
- no `booktitle`/`journal` in any of the 92 entries contains a lowercased
  `semantic web conference` / `international conference` / `web conference`

Add during later phases: a markdown-pipeline suite (one fixture per `markdown="block"` and
IAL case), a `kramdownSlug` suite, and an `excerpt`/`truncatewords` suite.

### 7.7 The spike — what has already been proven

A working Astro spike was built against the real inputs to de-risk the plan's core claim. It
lives in `migration-reference/` (`lib/bibliography.ts`, `lib/bibquery.ts`, `BibEntry.astro`,
`test/`) and is a verified starting point for Phase 3–4.

What it establishes:

- `/publications/` renders from the real `references.bib` with the unmodified `_sass/`:
  **92 entries, 12 year groups, 92 "More" links, 332 linked + 12 plain authors = 344 author
  renderings**, matching the bibtex-ruby ground truth exactly.
- Build time **1.5 s** for the page including the one-time 759 ms BibTeX parse.
- All 28 unit tests pass.
- It caught all three defaults in §4.7. Two of them — `sentenceCase` and NFD — produce
  output that looks plausible and would very likely have shipped unnoticed.

Screenshots at 1280/560 px confirm the rendering matches the production design. They are
**not** a substitute for §7.2/§7.3: the spike has no golden baseline to diff against, because
the Ruby 2.7 baseline could not be built in that environment (§7.1).


### 7.8 Build-time assertions that stay in the repo

Not one-off checks — permanent guards, so the bibliography pipeline cannot rot the way
`jekyll-scholar` did:

- 92 entries parsed; 92 detail pages emitted.
- Every author resolves to a `knows.yml` entry or the explicit allowlist (§6.2).
- Zod schemas on all four `_data/*.yml` files and on the parsed bibliography.
- The §7.6 vitest suite in CI, with the entry-order, query-count and unlinked-author
  snapshots committed.

---

## 8. Phased plan

Each phase ends in a reviewable, verifiable state.

| # | Phase | Deliverable | Exit criterion |
|---|---|---|---|
| 0 | **Baseline** | `_site_golden` via Docker Ruby 2.7; diff/RDF/anchor comparison scripts | Scripts show golden vs. golden = zero differences |
| 1 | **Scaffold** | Astro + TS + `sass`; `site.config.ts`; SCSS prebuild; `public/` passthrough | `/css/main.css` byte-identical to golden |
| 2 | **Shell** | `Default`/`Page` layouts; `Head`/`Header`/`Footer`/`GoogleAnalytics`/`SocialIcon` components | A static page (`/contact/`, `/research_goals/`) diffs clean, **including RDFa** |
| 3 | **Bibliography engine** | `lib/bibliography.ts`, `bibquery.ts` + the 28-test suite — **already built and passing in `migration-reference/`**; port it in and add `entry.bibtex` serialisation | Entry set, order and query counts match golden; `entry.bibtex` matches the 92 golden `<pre>` fixtures |
| 4 | **Publications** | `BibEntry`/`BibList` components; `/publications/` (grouped) and the 92 `/publications/:key/` pages | All 93 pages diff clean; RDF graphs identical |
| 5 | **Markdown pipeline** | remark config: `markdown="block"`, IAL, smartypants, slugs, Shiki theme | 6 posts + `/cv/`, `/reading_list/`, `/research_goals/` diff clean; code blocks visually verified |
| 6 | **Remaining pages** | `/`, `/about/`, `/blog/`, `/projects/`, `/old-projects/`, `/presentations/`, `/cv/`, `feed.xml` | Whole-tree diff clean; anchor + link checks pass |
| 7 | **CI/CD** | Replace Ruby workflow with Node; keep the rsync deploy; make checks blocking | Green CI; build time recorded |
| 8 | **Cleanup** | Remove `Gemfile`, `Gemfile.lock`, `Rakefile`, `.ruby-version`, `script/cibuild`, `_layouts/`, `_includes/`, `migration-reference/`; update `README.md` | Nothing Ruby remains |

**Phases 0–4 are the critical path.** The bibliography is both the performance problem and
the fidelity risk; getting it verified early de-risks everything after it. Phases 1–2 and 3
are independent and can proceed in parallel.

### Deployment note

The deploy step (`rsync` over SSH to `rubensworks.net`) does not need to change — only the
build that produces the directory. Keep `secrets.SCP_*` and `secrets.SCP_DEPLOY_RSA` as they
are. The `libxml2-dev`/`libxslt-dev` install and the Ruby setup steps disappear.

---

## 9. Risks

| Risk | Severity | Status / mitigation |
|---|---|---|
| `entry.bibtex` serialisation differs from `BibTeX::Entry#to_s` (field order, `{}` quoting) — visible on all 92 detail pages | **High** | **Open.** The one piece of jekyll-scholar not yet reproduced. Extract the 92 golden `<pre class="bibtex">` blocks as fixtures in Phase 3 and make them a unit test |
| `markdown="block"` handling (22 sites) subtly changes post structure | **High** | **Open, and confirmed nastier than expected** — output is *partially* converted, leaving stray `**` markers that survive a skim (§4.9). Dedicated remark plugin + a fixture test per occurrence |
| Parser sentence-cases titles, corrupting all 92 booktitles | **High** | **Closed** — `sentenceCase: false`, §4.7.1, 2 regression tests |
| LaTeX accents decode to NFD, breaking `knows.yml` lookup and dropping author RDFa | **High** | **Closed** — `.normalize('NFC')`, §4.7.2, covered by tests |
| Syntax-highlighting colours drift | Medium | **Open, and larger than it looked.** Astro's default is a *dark* Shiki theme with inline styles (§4.9). §6.7; before/after screenshots of all 26 blocks |
| Astro 7's markdown engine (`satteri`) is 4 months old, pre-1.0, single-maintainer | Medium | **Accepted with an escape hatch.** §4.8: remark plugins verified working; `markdown.processor` can be pointed back at `@astrojs/markdown-remark`, or pin Astro 6.x |
| A single-maintainer package on the critical path (`@retorquere/bibtex-parser`) | Low | Build-time only, isolated behind `lib/bibliography.ts`, output pinned by snapshots (§4.5) |
| Sort order differs on the entry with no `month`, or on month-name parsing | Medium | **Closed** — §7.6, entry order snapshotted, month parsing tested |
| Custom `_type`/`_highlighted` fields dropped by the BibTeX parser | Medium | **Closed** — citation-js rejected for this reason (§4.6); test asserts they survive |
| RDFa attribute loss during template rewrite | Medium | **Open.** §7.3 graph comparison at every phase, not just at the end |
| Excerpt/`truncatewords` differences change `<meta name="description">` | Low | **Open.** Covered by the §7.2 diff |
| `.well-known` now published (§6.8) | Low | Intentional; confirm it is wanted |

---

## 10. Open questions

1. **Syntax highlighting** — accept a visually-equivalent Shiki theme (option 1, §6.7), or
   invest in exact Pygments class-name parity (option 2)? *This is the only remaining
   decision that changes how much work Phase 5 is.*
2. **Disqus** — `_includes/comments.html` has its loader fully commented out, so comments
   are inert on all 6 posts despite `comments: true`. Port the dead code as-is, or drop it?
3. **`.well-known/nostr.json`** — confirm it should be published (§6.8). If it is currently
   served by other means, the new build may need to exclude it to avoid a conflict.
4. **`main.css` URL** — keep the stable `/css/main.css` path, or accept Astro's
   content-hashed filename for better caching once the diff is clean?
5. **`_projects/*.html`** — keep as `.html` behind a custom loader (input files untouched,
   as assumed above), or convert to `.md`/`.astro` for simplicity?

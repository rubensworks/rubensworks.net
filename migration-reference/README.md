# Migration reference implementation

Verified starting point for Phase 3–4 of [`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md).
Built and tested against the real `_bibliography/references.bib` and `_data/knows.yml`.

| File | What it is |
|---|---|
| `lib/bibliography.ts` | Parses `references.bib` **once**, decodes LaTeX, normalises to NFC, sorts year/month descending, groups by year. Replaces jekyll-scholar's parse + sort + group. |
| `lib/bibquery.ts` | Port of bibtex-ruby's five `--query` operators (`=`, `^=`, `~=`, `!~`, `!=`) with the `@*[…&&…]` grammar. |
| `BibEntry.astro` | Port of `_layouts/bib.html`, RDFa and microdata attributes preserved. |
| `test/bibliography.test.ts` | 28 vitest tests. Snapshots pin the 92-entry order, the 16 query counts, and the 12 legitimately-unlinked authors. |

Ground truth was extracted by running the real `bibtex-ruby` 4.4.7 + `namae` stack that
jekyll-scholar uses, then diffing against the TypeScript output — see plan §6.2 and §4.6.

## Running

```bash
npm i astro@7 sass@1 vitest@4 @retorquere/bibtex-parser@10 yaml@2
npx vitest run          # expects references.bib and _data/knows.yml at the repo root
```

## Not yet implemented

`entry.bibtex` re-serialisation (the `<pre class="bibtex content">` block on the 92 detail
pages) — the highest remaining risk in the plan. See §9.

Delete this directory in Phase 8.

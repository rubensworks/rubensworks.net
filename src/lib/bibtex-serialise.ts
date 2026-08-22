import { readFileSync } from 'node:fs'

/**
 * Reproduces `BibTeX::Entry#to_s(quotes: ['{','}'])` as jekyll-scholar calls it, which is
 * what fills the `<pre class="bibtex content">` block on all 92 detail pages.
 *
 * The semantics were read out of `jekyll-scholar-5.16.0/lib/jekyll/scholar/utilities.rb`
 * and then confirmed by running the real bibtex-ruby 4.4.7 under Ruby 2.7:
 *
 *  - `liquidify` (utilities.rb:520-537) builds `e['bibtex']` from the entry **before**
 *    `bibtex_filters` runs, so LaTeX escapes and inner braces survive verbatim:
 *    `Rojas Mel{\'e}ndez` stays exactly that, and `{Solid}` keeps its braces. Values must
 *    therefore come from the raw file, not from the decoded parse.
 *  - `bibtex_options` is `{ strip: false, parse_months: true }` (defaults.rb:38). `strip:
 *    false` is why multi-line values keep their newlines; each newline inside a value comes
 *    back indented by two extra spaces. Verified against the gem:
 *        "{Line one\n    four}"  ->  "{Line one\n      four}"
 *        "{Line one\n\ttab}"     ->  "{Line one\n  \ttab}"
 *        "{Line one\nnone}"      ->  "{Line one\n  none}"
 *  - `parse_months: true` turns the month into a bare BibTeX symbol, emitted without
 *    braces: `month = {october}` becomes `month = oct`. Matching is on the lowercased
 *    first three letters, which is why the file's `{februari}` typo still yields `feb`.
 *    It also adds a `month_numeric` field, which `bibtex_skip_fields` then removes.
 *  - Field order is the order they appear in the file; bibtex-ruby preserves it.
 *
 * The file uses no @string definitions, no `"`-quoted values, no concatenation and no bare
 * values, so the parser below only has to handle `name = {value}`. `parseRawEntries` throws
 * on anything else rather than guessing.
 */

export interface RawEntry {
  type: string
  key: string
  fields: [name: string, value: string][]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Fields bibtex-ruby holds as `BibTeX::Names`, and therefore re-renders rather than echoes. */
const NAME_FIELDS = new Set(['author', 'editor', 'translator'])

/**
 * `BibTeX::Names#to_s` — the normalised `Last, First and Last, First` form.
 *
 * This is not cosmetic: it is also the string the `--query` operators match against, which
 * is what makes `author ^= Taelman` mean "first author" and `author ~= Ruben$` mean "last
 * author" (plan §6.1).
 *
 * Three shapes appear in references.bib and all three are covered by the 92-block fixture:
 *  - `Last, First` — already normalised, only whitespace is tidied.
 *  - `First Last` — reordered. `taelman_towards_privacy_aggregation_2020` is the only entry
 *    written this way.
 *  - `Emonet, Vincent,` — a stray trailing comma, which bibtex-ruby's parser discards
 *    (`kuhn_peerj_decentralizednanopubs_2021`).
 */
export function normaliseNames(value: string): string {
  return splitOnAnd(value)
    .map((n) => normaliseName(n))
    .join(' and ')
}

/** Splits on the ` and ` separator, ignoring any that sit inside braces. */
function splitOnAnd(value: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!
    if (c === '\\') {
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && /\s/.test(c)) {
      const m = /^\s+and\s+/.exec(value.slice(i))
      if (m) {
        parts.push(value.slice(start, i))
        i += m[0].length - 1
        start = i + 1
      }
    }
  }
  parts.push(value.slice(start))
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

function normaliseName(name: string): string {
  const collapsed = name.replace(/\s+/g, ' ').trim().replace(/,\s*$/, '')
  // A name wrapped entirely in braces is a literal — a corporate author such as
  // `{Ghent University and imec}` — and is passed through untouched.
  if (collapsed.startsWith('{') && matchingBrace(collapsed, 0) === collapsed.length - 1) {
    return collapsed
  }
  const comma = indexOfTopLevel(collapsed, ',')
  if (comma >= 0) {
    const family = collapsed.slice(0, comma).trim()
    const given = collapsed.slice(comma + 1).trim().replace(/,\s*$/, '')
    return given ? `${family}, ${given}` : family
  }
  // `First von Last`: BibTeX takes the von part to start at the first lowercase-initial
  // word, and everything from there on is the family name.
  const words = collapsed.split(' ')
  if (words.length < 2) return collapsed
  let vonStart = words.findIndex((w, i) => i > 0 && i < words.length - 1 && /^[a-z]/.test(w))
  if (vonStart < 0) vonStart = words.length - 1
  const given = words.slice(0, vonStart).join(' ')
  const family = words.slice(vonStart).join(' ')
  return given ? `${family}, ${given}` : family
}

/** Index of the `}` closing the `{` at `from`, or -1 if unbalanced. */
function matchingBrace(s: string, from: number): number {
  let depth = 0
  for (let i = from; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\') {
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function indexOfTopLevel(s: string, char: string): number {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!
    if (c === '\\') {
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') depth--
    else if (depth === 0 && c === char) return i
  }
  return -1
}

/** bibtex-ruby's month symbol, or null when the value is not a recognisable month. */
export function monthSymbol(raw: string): string | null {
  const k = raw.trim().toLowerCase().slice(0, 3)
  return MONTHS.includes(k) ? k : null
}

/**
 * Splits the .bib source into entries with values kept byte-for-byte, brace nesting and
 * all. Deliberately independent of @retorquere/bibtex-parser, whose job is the decoded view.
 */
export function parseRawEntries(source: string): RawEntry[] {
  const entries: RawEntry[] = []
  let i = 0

  while (i < source.length) {
    const at = source.indexOf('@', i)
    if (at < 0) break

    const header = /^@([A-Za-z]+)\s*\{\s*([^,\s]+)\s*,/.exec(source.slice(at))
    if (!header) {
      i = at + 1
      continue
    }
    const type = header[1]!.toLowerCase()
    if (type === 'comment' || type === 'string' || type === 'preamble') {
      throw new Error(`@${type} is not supported by the bibtex serialiser`)
    }
    const key = header[2]!
    let p = at + header[0].length
    const fields: [string, string][] = []

    for (;;) {
      // Skip whitespace and any trailing comma from the previous field.
      while (p < source.length && /[\s,]/.test(source[p]!)) p++
      if (source[p] === '}') {
        p++
        break
      }
      const fm = /^([A-Za-z_][A-Za-z0-9_-]*)\s*=\s*/.exec(source.slice(p))
      if (!fm) throw new Error(`Malformed field in @${type}{${key}} at offset ${p}`)
      p += fm[0].length
      if (source[p] !== '{') {
        throw new Error(
          `@${type}{${key}}: field "${fm[1]}" is not brace-delimited; only {…} values are supported`,
        )
      }
      // Consume the balanced brace group; inner braces are part of the value.
      let depth = 0
      const start = p
      for (; p < source.length; p++) {
        const c = source[p]
        if (c === '\\') {
          p++
          continue
        }
        if (c === '{') depth++
        else if (c === '}') {
          depth--
          if (depth === 0) break
        }
      }
      if (depth !== 0) throw new Error(`@${type}{${key}}: unbalanced braces in "${fm[1]}"`)
      fields.push([fm[1]!, source.slice(start + 1, p)])
      p++
    }

    entries.push({ type, key, fields })
    i = p
  }

  return entries
}

/** `BibTeX::Value#to_s` under `strip: false`: newlines carry a two-space continuation indent. */
const indentValue = (v: string) => v.replace(/\n/g, '\n  ')

export function serialiseEntry(entry: RawEntry, skipFields: readonly string[]): string {
  const skip = new Set(skipFields.map((f) => f.toLowerCase()))
  const lines = entry.fields
    .filter(([name]) => !skip.has(name.toLowerCase()))
    .map(([rawName, value]) => {
      // bibtex-ruby stores field names as downcased symbols, so `bookTitle` in the file
      // comes back out as `booktitle` (dimou_ekaw_workshop_2016).
      const name = rawName.toLowerCase()
      if (name === 'month') {
        const sym = monthSymbol(value)
        // A parsed month is a symbol and loses its braces; anything else stays a string.
        if (sym) return `  ${name} = ${sym}`
      }
      const out = NAME_FIELDS.has(name) ? normaliseNames(value) : value
      return `  ${name} = {${indentValue(out)}}`
    })
  return `@${entry.type}{${entry.key},\n${lines.join(',\n')}\n}\n`
}

let cache: Map<string, string> | null = null

/** key -> the exact `<pre class="bibtex content">` text for that entry. */
export function loadBibtexBlocks(
  skipFields: readonly string[],
  path = '_bibliography/references.bib',
): Map<string, string> {
  if (cache) return cache
  const raw = parseRawEntries(readFileSync(path, 'utf8'))
  cache = new Map(raw.map((e) => [e.key, serialiseEntry(e, skipFields)]))
  return cache
}

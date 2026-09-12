import { readFileSync } from 'node:fs'

/**
 * Renders an entry in canonical BibTeX form — the `<pre class="bibtex content">` block a
 * visitor copies off a publication page, so it has to parse back to the same entry:
 *
 *  - Values are echoed from the raw file, not the decoded parse, so LaTeX escapes and inner
 *    braces survive (`Rojas Mel{\'e}ndez`, `{Solid}`).
 *  - Newlines inside a value survive, each gaining a two-space continuation indent.
 *  - The month becomes a bare symbol without braces: `month = {october}` -> `month = oct`.
 *    Matched on the lowercased first three letters, so the file's `{februari}` still works.
 *  - Fields keep their order in the file.
 *
 * The file uses no @string, quoted, concatenated or bare values, so the parser below only
 * handles `name = {value}` and throws on anything else rather than guessing.
 */

export interface RawEntry {
  type: string
  key: string
  fields: [name: string, value: string][]
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** Name lists: re-rendered into a normalised form rather than echoed from the file. */
const NAME_FIELDS = new Set(['author', 'editor', 'translator'])

/**
 * The normalised `Last, First and Last, First` form. Also the string `--query` matches, which
 * is what makes `author ^= Taelman` mean "first author" and `~= Ruben$` mean "last author".
 *
 * Handles all three shapes in the file: `Last, First`, `First Last` (reordered), and a stray
 * trailing comma (discarded).
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
  // A fully braced name is a literal (`{Ghent University and imec}`): pass it through.
  if (collapsed.startsWith('{') && matchingBrace(collapsed, 0) === collapsed.length - 1) {
    return collapsed
  }
  const comma = indexOfTopLevel(collapsed, ',')
  if (comma >= 0) {
    const family = collapsed.slice(0, comma).trim()
    const given = collapsed.slice(comma + 1).trim().replace(/,\s*$/, '')
    return given ? `${family}, ${given}` : family
  }
  // `First von Last`: the von part starts at the first lowercase-initial word, and
  // everything from there is the family name.
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

/** The bare month symbol (`oct`), or null when the value is not a recognisable month. */
export function monthSymbol(raw: string): string | null {
  const k = raw.trim().toLowerCase().slice(0, 3)
  return MONTHS.includes(k) ? k : null
}

/** Splits the source into entries, values byte-for-byte. The parser gives the decoded view. */
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
      // Field names are case-insensitive: `bookTitle` comes back out as `booktitle`.
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

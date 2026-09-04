import type { Entry } from './bibliography'

/**
 * Port of bibtex-ruby's query operators (elements.rb:195-232).
 * `actual` is the field's string form; for `author` that is the normalised
 * "Last, First and Last, First" string — which is what makes
 * `author ^= Taelman` mean "first author" and `author ~= Ruben$` mean "last author".
 */
export type Op = '=' | '^=' | '~=' | '!~' | '!='

export function matchOp(actual: string | undefined, op: Op, value: string): boolean {
  switch (op) {
    case '=':  return actual != null && actual === value
    case '^=': return actual != null && new RegExp('^' + value).test(actual)
    case '~=': return actual != null && new RegExp(value).test(actual)
    case '!~': return actual == null || !new RegExp(value).test(actual)
    case '!=': return actual == null || actual !== value
  }
}

function field(e: Entry, name: string): string | undefined {
  // Raw values, not rendered ones: jekyll-scholar queries the bibliography before
  // bibtex_filters runs. See Entry.queryFields.
  if (name === 'author') return e.authorString
  return e.queryFields[name.toLowerCase()]
}

/** Parses `@*[cond && cond]` and returns a predicate. */
export function compileQuery(query: string): (e: Entry) => boolean {
  const m = query.trim().match(/^@\*(?:\[(.*)\])?$/)
  if (!m) throw new Error(`Unsupported query: ${query}`)
  if (!m[1]) return () => true
  const conds = m[1].split('&&').map((c) => {
    // The field name excludes the operator characters on purpose. `\S+` would happily
    // swallow the `^` of a space-free `author^=Taelman` and leave `=` as the operator,
    // turning "first author is Taelman" into an equality test that never matches.
    const cm = c.trim().match(/^([A-Za-z_][\w-]*)\s*(\^=|~=|!~|!=|\/=|=)\s*(.+)$/)
    if (!cm) throw new Error(`Unsupported condition: ${c}`)
    const op = (cm[2] === '/=' ? '!=' : cm[2]) as Op
    return { name: cm[1], op, value: cm[3].trim() }
  })
  return (e) => conds.every((c) => matchOp(field(e, c.name), c.op, c.value))
}

export function queryEntries(entries: Entry[], query: string): Entry[] {
  return entries.filter(compileQuery(query))
}

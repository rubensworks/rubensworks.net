import type { ShikiTransformer, ThemedToken } from 'shiki'

/**
 * Reproduces the two places where Rouge's lexers disagree with a TextMate grammar.
 *
 * The theme in `shiki-rouge-github.ts` maps scopes to Rouge's colours, which covers
 * everything a grammar can express. These two cases depend on the *token text*, not on the
 * scope, so no theme can reach them — and both are visible on the blog today.
 *
 * Verified character by character against the Jekyll output by `verify/code-colors.mjs`.
 */

// Rouge's Javascript lexer keyword lists (lib/rouge/lexers/javascript.rb). Its identifier
// rule consults them with no lookbehind for a preceding `.`, so a property name that
// happens to be a reserved word — `require('rdf-parse').default`, `store.import(…)` — comes
// out as a bold Keyword. The TextMate grammar is structural and calls those properties.
const JS_KEYWORDS = new Set([
  'async', 'await', 'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'export', 'finally', 'from', 'for', 'if', 'import', 'in', 'instanceof',
  'new', 'of', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'void', 'while',
  'with', 'yield',
  'class', 'const', 'extends', 'function', 'let', 'super', 'var',
  'abstract', 'boolean', 'byte', 'char', 'double', 'enum', 'final', 'float', 'goto',
  'implements', 'int', 'interface', 'long', 'native', 'package', 'private', 'protected',
  'public', 'short', 'static', 'synchronized', 'throws', 'transient', 'volatile',
  'false', 'null', 'NaN', 'Infinity', 'true', 'undefined',
])

// Rouge's SPARQL lexer reserves Operator for the property-path operators and the language
// tag marker; the comparison operators are Punctuation, and so unstyled. The grammar puts
// all of them under `support.class.sparql`, which the theme has to bold for `/` and `*`.
const SPARQL_PUNCTUATION = new Set(['=', '!=', '<', '>', '<=', '>=', '&&', '||'])

const BOLD = 2 // FontStyle.Bold
const IDENTIFIER = /[$A-Za-z_][$\w]*/g

/** True when the theme gave this token nothing beyond the plain body style. */
const isPlain = (t: ThemedToken) =>
  (t.color ?? '').toLowerCase() === '#000000' && !t.fontStyle

/** Splits `token` around every reserved word in it, bolding the words. */
function boldKeywords(token: ThemedToken, out: ThemedToken[]) {
  // Restricting this to plain tokens keeps Rouge's own rule ordering: it matches an
  // object-literal key as Name.Attribute *before* reaching the identifier rule, so
  // `{ default: ComunicaEngine }` stays teal on both sides.
  if (!isPlain(token)) return out.push(token)
  let at = 0
  IDENTIFIER.lastIndex = 0
  for (let m = IDENTIFIER.exec(token.content); m; m = IDENTIFIER.exec(token.content)) {
    if (!JS_KEYWORDS.has(m[0])) continue
    if (m.index > at) {
      out.push({ ...token, content: token.content.slice(at, m.index), offset: token.offset + at })
    }
    out.push({ ...token, content: m[0], offset: token.offset + m.index, fontStyle: BOLD })
    at = m.index + m[0].length
  }
  if (at === 0) out.push(token)
  else if (at < token.content.length) {
    out.push({ ...token, content: token.content.slice(at), offset: token.offset + at })
  }
}

export function rougeLexerQuirks(): ShikiTransformer {
  return {
    name: 'rouge-lexer-quirks',
    tokens(lines) {
      const lang = this.options.lang
      if (lang === 'javascript' || lang === 'js') {
        return lines.map((line) => {
          const out: ThemedToken[] = []
          for (const token of line) boldKeywords(token, out)
          return out
        })
      }
      if (lang === 'sparql') {
        return lines.map((line) =>
          line.map((token) =>
            token.fontStyle === BOLD && SPARQL_PUNCTUATION.has(token.content.trim())
              ? { ...token, fontStyle: 0 }
              : token,
          ),
        )
      }
    },
  }
}

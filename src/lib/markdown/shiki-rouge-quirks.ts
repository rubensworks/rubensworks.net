import type { ShikiTransformer, ThemedToken } from 'shiki'

/**
 * Two colourings that depend on the token *text* rather than its scope, so no theme can
 * express them. Both are visible in the code blocks on the blog.
 */

// A reserved word used as a property name — `require('x').default`, `store.import(…)` — is
// bolded like a keyword. The TextMate grammar is structural and calls those properties.
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

// In SPARQL only the property-path operators and the language-tag `@` are bold; the
// comparison operators are punctuation. The grammar puts all of them in one scope.
const SPARQL_PUNCTUATION = new Set(['=', '!=', '<', '>', '<=', '>=', '&&', '||'])

const BOLD = 2 // FontStyle.Bold
const IDENTIFIER = /[$A-Za-z_][$\w]*/g

/** True when the theme gave this token nothing beyond the plain body style. */
const isPlain = (t: ThemedToken) =>
  (t.color ?? '').toLowerCase() === '#000000' && !t.fontStyle

/** Splits `token` around every reserved word in it, bolding the words. */
function boldKeywords(token: ThemedToken, out: ThemedToken[]) {
  // Plain tokens only, so an object-literal key named `default` keeps its own colour.
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

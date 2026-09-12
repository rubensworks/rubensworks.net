/**
 * A Shiki theme carrying the colours of `_sass/_syntax-highlighting.scss`, which styles ~50
 * Pygments token classes no JS highlighter emits. Each colour below names the Pygments token
 * it came from, so the two stay traceable; the stylesheet still supplies the background and
 * vertical rhythm.
 *
 * Tuned to the three languages the code blocks use — javascript, json and sparql. TextMate
 * grammars are far more granular than Pygments tokens, so a fourth language needs the same
 * pass: find the tokens that come out coloured where the stylesheet leaves them black.
 */
export const rougeGithub = {
  name: 'rouge-github',
  type: 'light' as const,
  colors: {
    // .highlight inside .highlighter-rouge — the pale blue code background.
    'editor.background': '#eef',
    'editor.foreground': '#000000',
  },
  settings: [
    { settings: { background: '#eef', foreground: '#000000' } },

    // Most Pygments tokens are unstyled and inherit the body colour, so the broad scopes are
    // pinned to black first and the specific ones coloured after. Without this, identifiers
    // (`.nx`), punctuation (`.p`), string delimiters (`.dl`) and object keys (`.nl`) all pick
    // up a colour the stylesheet never gives them.
    {
      scope: [
        'variable',
        'variable.other',
        'variable.language',
        'entity.name.function',
        'entity.name.type',
        'entity.name.class',
        'entity.name.label',
        'support.class',
        'support.type',
        'support.type.property-name',
        'support.variable',
        'meta.function-call',
        'storage.type.class',
        'punctuation',
        'punctuation.separator',
        'punctuation.terminator',
        'meta.brace',
        'meta.delimiter',
        'constant.language',
      ],
      settings: { foreground: '#000000', fontStyle: '' },
    },

    // .c / .cm / .c1 — comments. `#998` expands to #999988.
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#999988', fontStyle: 'italic' },
    },
    // .cp / .cs — preprocessor and special comments
    {
      scope: ['comment.block.preprocessor', 'comment.documentation'],
      settings: { foreground: '#999999', fontStyle: 'bold' },
    },

    // .k / .kc / .kd / .kp / .kr / .o / .ow — keywords and operators
    {
      scope: ['keyword', 'storage', 'storage.type', 'storage.modifier', 'keyword.operator'],
      settings: { foreground: '#000000', fontStyle: 'bold' },
    },

    // .s and the .s* family — strings. In JavaScript the quotes are a separate, unstyled
    // `.dl`; in JSON and SPARQL they are part of the string.
    { scope: ['string', 'string.quoted'], settings: { foreground: '#dd1144', fontStyle: '' } },
    {
      scope: [
        'punctuation.definition.string.begin.js',
        'punctuation.definition.string.end.js',
      ],
      settings: { foreground: '#000000' },
    },
    {
      scope: [
        'punctuation.definition.string.begin.json',
        'punctuation.definition.string.end.json',
        'punctuation.definition.string.begin.turtle',
        'punctuation.definition.string.end.turtle',
      ],
      settings: { foreground: '#dd1144' },
    },
    // .se — escapes inside a string keep the string colour
    { scope: ['constant.character.escape'], settings: { foreground: '#dd1144' } },
    // .sr — regular expressions
    { scope: ['string.regexp'], settings: { foreground: '#009926' } },

    // .m / .mf / .mh / .mi / .mo / .il — numbers
    { scope: ['constant.numeric'], settings: { foreground: '#009999', fontStyle: '' } },
    // .na — attribute names
    { scope: ['entity.other.attribute-name'], settings: { foreground: '#008080', fontStyle: '' } },
    // .nb — builtins
    { scope: ['support.function'], settings: { foreground: '#0086b3', fontStyle: '' } },
    // .nn — namespaces and prefixes
    { scope: ['entity.name.namespace'], settings: { foreground: '#555555', fontStyle: '' } },
    // .nt — tags
    { scope: ['entity.name.tag'], settings: { foreground: '#000080', fontStyle: '' } },
    // .ni — entities
    { scope: ['constant.character.entity'], settings: { foreground: '#800080' } },
    // .ss — symbols
    { scope: ['constant.other.symbol'], settings: { foreground: '#990073' } },

    // .err — errors
    { scope: ['invalid'], settings: { foreground: '#a61717', background: '#e3d2d2' } },

    // --- Per-grammar corrections -------------------------------------------------------
    // TextMate grammars name the same construct differently per language, so where a broad
    // scope above lands on the wrong Pygments class the specific scope is restated here —
    // the longest matching scope wins.

    // JavaScript: an object-literal key and a destructuring key are both Rouge `.na`,
    // not the plain identifiers the broad `variable` rule above would make them.
    {
      scope: ['meta.object-literal.key', 'variable.object.property'],
      settings: { foreground: '#008080', fontStyle: '' },
    },
    // JavaScript: the backticks of a template literal are part of the string for Rouge,
    // unlike the quotes of a plain string, so they keep the string colour.
    { scope: ['punctuation.definition.string.template'], settings: { foreground: '#dd1144' } },

    // SPARQL/Turtle: `?var` is `.nv`, a prefixed local name is `.ss`, and both the prefix
    // and a full IRI are `.nn`.
    { scope: ['constant.variable.sparql'], settings: { foreground: '#008080', fontStyle: '' } },
    { scope: ['support.variable.PN_LOCAL'], settings: { foreground: '#990073', fontStyle: '' } },
    {
      scope: ['storage.type.PNAME_NS', 'entity.name.type.iriref'],
      settings: { foreground: '#555555', fontStyle: '' },
    },
    // `/` and the comparison operators are `.o`, `true`/`false` are `.kc`, and the `@` of a
    // language tag is `.o` too (the tag itself is `.py`, which the stylesheet leaves black).
    {
      scope: [
        'support.class.sparql',
        'constant.language.sparql',
        'meta.string-literal-language-tag',
      ],
      settings: { foreground: '#000000', fontStyle: 'bold' },
    },
  ],
}

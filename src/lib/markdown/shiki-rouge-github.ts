/**
 * A Shiki theme that reproduces the colours the site already ships.
 *
 * `_sass/_syntax-highlighting.scss` styles ~50 Rouge/Pygments token classes — the classic
 * Rouge *github* theme. No JS highlighter emits those class names (Shiki uses inline styles,
 * Prism and starry-night have their own vocabularies), so the choice was between matching
 * the colours and rebuilding class-name parity; the colours won (plan §6.7, option 1).
 *
 * Every colour below is copied from the SCSS, with the Pygments token it came from named so
 * the two stay traceable. The stylesheet itself is left in place and untouched: it still
 * provides the `.highlight` background and vertical rhythm that
 * `rehype-rouge-wrapper.ts` keeps hooking into.
 *
 * The scope-to-colour mapping is tuned to the three languages the site's code blocks use —
 * javascript, json and sparql — and was derived by comparing the golden Jekyll output
 * character by character. `verify/code-colors.mjs` re-runs that comparison and currently
 * requires it to be exact, so a wrong mapping fails the check rather than shipping. A post
 * in a fourth language would need the same treatment: run the check, read the shapes it
 * reports, and add the scopes it names.
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

    // Rouge leaves most tokens unstyled, so they inherit the body colour. TextMate grammars
    // are far more granular than Rouge's lexers, so the broad scopes are pinned to black
    // first and the specific ones are coloured after. Without this, ordinary identifiers
    // (Rouge `.nx`), punctuation (`.p`), string delimiters (`.dl`) and object keys (`.nl`)
    // all pick up a colour Rouge never gave them — 2716 of 8511 code characters on the blog.
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

    // .s and the .s* family — strings. In JavaScript, Rouge emits the surrounding quotes as
    // a separate, unstyled `.dl`; in JSON and SPARQL it folds them into the string itself,
    // so only the JavaScript delimiters are pulled back to black.
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
    // scope above lands on the wrong Rouge class the specific scope is restated here (the
    // longest matching scope wins). Everything below was derived by diffing the golden
    // build character by character — see verify/code-colors.mjs.

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

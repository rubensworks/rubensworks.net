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

    // .c / .cm / .c1 — comments
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#998998', fontStyle: 'italic' },
    },
    // .cp / .cs — preprocessor and special comments
    {
      scope: ['comment.block.preprocessor', 'comment.documentation'],
      settings: { foreground: '#999999', fontStyle: 'bold' },
    },

    // .k / .kc / .kd / .kp / .kr / .o / .ow — keywords and operators
    {
      scope: ['keyword', 'storage', 'storage.type', 'keyword.operator'],
      settings: { foreground: '#000000', fontStyle: 'bold' },
    },
    // .kt / .nc — types and class names
    {
      scope: ['entity.name.type', 'entity.name.class', 'support.class', 'storage.type.class'],
      settings: { foreground: '#445588', fontStyle: 'bold' },
    },

    // .s and the whole .s* family — strings
    {
      scope: ['string', 'punctuation.definition.string', 'string.quoted'],
      settings: { foreground: '#dd1144' },
    },
    // .sr — regular expressions
    { scope: ['string.regexp'], settings: { foreground: '#009926' } },
    // .ss — symbols
    { scope: ['constant.other.symbol'], settings: { foreground: '#990073' } },

    // .m / .mf / .mh / .mi / .mo / .il — numbers
    { scope: ['constant.numeric'], settings: { foreground: '#009999' } },
    // .no / .na / .nv / .vc / .vg / .vi — constants, attributes, variables
    {
      scope: ['constant.language', 'constant.other', 'entity.other.attribute-name', 'variable'],
      settings: { foreground: '#008080' },
    },
    // .nb — builtins
    { scope: ['support.function', 'support.constant'], settings: { foreground: '#0086b3' } },
    // .nf / .ne — function and exception names
    {
      scope: ['entity.name.function', 'entity.name.exception'],
      settings: { foreground: '#990000', fontStyle: 'bold' },
    },
    // .nt — tags
    { scope: ['entity.name.tag'], settings: { foreground: '#000080' } },
    // .nn — namespaces
    { scope: ['entity.name.namespace'], settings: { foreground: '#555555' } },
    // .ni — entities
    { scope: ['constant.character.entity'], settings: { foreground: '#800080' } },
    // Object keys are the one place where Rouge's two lexers disagree, so the scopes are
    // split rather than merged:
    //   JSON  -> `.nl` (Name.Label), which _syntax-highlighting.scss does not style, so the
    //            keys inherit the body colour. Pinned to black, because Shiki would
    //            otherwise apply its own property-name colour.
    //   JS    -> `.na` (Name.Attribute), teal like the other Name.* tokens.
    // Both were checked against the rendered code blocks in the streaming-parsers post.
    { scope: ['support.type.property-name'], settings: { foreground: '#000000' } },
    { scope: ['meta.object-literal.key', 'variable.other.property'], settings: { foreground: '#008080' } },

    // .err — errors
    {
      scope: ['invalid'],
      settings: { foreground: '#a61717', background: '#e3d2d2' },
    },
  ],
}

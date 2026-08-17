import { defineConfig } from 'astro/config'
import { site } from './src/site.config.ts'
import { remarkInlineHtmlParagraph } from './src/lib/markdown/remark-inline-html-paragraph.ts'

export default defineConfig({
  site: site.url,
  outDir: './dist',
  publicDir: './public',
  // OFF deliberately. Astro minifies HTML by default, which collapses the whole document
  // onto one line and makes the whole-tree diff against _site_golden unreadable. Fidelity
  // review is worth more here than the handful of bytes gzip would have removed anyway.
  compressHTML: false,
  build: { format: 'directory' },
  markdown: {
    // OFF to match kramdown, which implements none of GFM's extensions: autolink literals
    // (which would nest an <a> inside the hand-written <a href="mailto:…">…</a> on
    // /contact/), strikethrough, task lists or footnotes. The content uses no GFM tables
    // either, so nothing is lost.
    gfm: false,
    smartypants: true,
    remarkPlugins: [remarkInlineHtmlParagraph],
  },
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          loadPaths: ['_sass'],
          // _sass/*.scss is an input file that must stay unchanged, and it uses `/` division
          // and lighten()/darken() throughout. Both still work; only the warnings are muted.
          silenceDeprecations: ['slash-div', 'color-functions', 'global-builtin', 'import'],
        },
      },
    },
  },
})

import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import { unified } from '@astrojs/markdown-remark'
import { site } from './src/site.config.ts'
import { markdownExtension } from './src/integrations/markdown-extension.ts'
import { markdownOptions } from './src/lib/markdown/pipeline.ts'

export default defineConfig({
  site: site.url,
  outDir: './dist',
  publicDir: './public',
  // OFF deliberately. Astro minifies HTML by default, which collapses the whole document
  // onto one line; readable output is worth more here than the handful of bytes gzip would
  // have removed anyway.
  compressHTML: false,
  build: { format: 'directory' },
  // Registers `.markdown` with the content layer so _posts/ can stay as it is.
  //
  // The sitemap lists every built page at /sitemap-index.xml, which robots.txt points at.
  // The site had none, so a search engine only ever found the pages it could reach by
  // following links — and the CV, the presentations and the 92 publication pages are linked
  // from one place each.
  integrations: [
    markdownExtension(),
    sitemap({
      // The 404 page is not content; nothing else is excluded.
      filter: (page) => !page.endsWith('/404/') && !page.endsWith('/404.html'),
      serialize: (item) => ({ ...item, lastmod: undefined, changefreq: undefined, priority: undefined }),
    }),
  ],
  markdown: {
    // The remark/rehype processor rather than Astro 7's default Sätteri: the posts are
    // written in kramdown, and the five plugins that cover the places kramdown and CommonMark
    // disagree are only reachable through this one. It is also the older and more settled of
    // the two engines.
    processor: unified({
      gfm: markdownOptions.gfm,
      smartypants: markdownOptions.smartypants,
      remarkPlugins: markdownOptions.remarkPlugins,
      rehypePlugins: markdownOptions.rehypePlugins,
    }),
    shikiConfig: markdownOptions.shikiConfig,
  },
  vite: {
    // Comunica's dependency tree still carries UMD footers that fall back to Node's bare
    // `global` when `window` is absent — `typeof window < 'u' ? window.X = e : global.X = e`.
    // A Web Worker has neither, so without this the worker dies on load with
    // `ReferenceError: global is not defined`. This is a textual substitution, so it would
    // also rewrite a variable of that name; nothing in this repo has one.
    define: { global: 'globalThis' },
    build: {
      // esbuild rewrites `(max-width: 600px)` to the Media Queries Level 4 range syntax
      // `(width<=600px)` unless it knows it has to support older engines. Safari below 16.4
      // (so every iOS 16.3 and earlier) drops the whole block, which loses the site's mobile
      // layout. The targets below are the oldest engines the hand-written CSS still works
      // in, and keep the minifier on the syntax `sass` emits.
      cssTarget: ['chrome61', 'edge18', 'firefox60', 'safari11'],
    },
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

import { defineConfig } from 'astro/config'
import { unified } from '@astrojs/markdown-remark'
import { site } from './src/site.config.ts'
import { markdownExtension } from './src/integrations/markdown-extension.ts'
import { markdownOptions } from './src/lib/markdown/pipeline.ts'

export default defineConfig({
  site: site.url,
  outDir: './dist',
  publicDir: './public',
  // OFF deliberately. Astro minifies HTML by default, which collapses the whole document
  // onto one line and makes the whole-tree diff against _site_golden unreadable. Fidelity
  // review is worth more here than the handful of bytes gzip would have removed anyway.
  compressHTML: false,
  build: { format: 'directory' },
  // Registers `.markdown` with the content layer so _posts/ can stay as it is.
  integrations: [markdownExtension()],
  markdown: {
    // The remark/rehype processor rather than Astro 7's default Sätteri: custom plugins are
    // only reachable through it, and this migration needs five of them for kramdown
    // compatibility. It is also the older and more settled of the two engines, which matters
    // because markdown fidelity is this migration's largest remaining risk.
    processor: unified({
      gfm: markdownOptions.gfm,
      smartypants: markdownOptions.smartypants,
      remarkPlugins: markdownOptions.remarkPlugins,
      rehypePlugins: markdownOptions.rehypePlugins,
    }),
    shikiConfig: markdownOptions.shikiConfig,
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

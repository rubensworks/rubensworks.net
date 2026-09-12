import type { Loader } from 'astro/loaders'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { expandIncludes } from '../lib/project-includes'
import { enhanceImgTags } from '../lib/images'

/**
 * Loads `_projects/*.html` — front matter plus a body that is already HTML. A dedicated
 * loader because the content layer has no `.html` entry type, and because running
 * hand-written HTML through a Markdown processor reflows the raw blocks. Bodies pass through
 * verbatim apart from the `{% include %}` tags, expanded by lib/project-includes.ts.
 */
export function htmlCollection(options: { base: string }): Loader {
  return {
    name: 'html-collection',
    load: async ({ store, parseData, generateDigest, watcher }) => {
      store.clear()
      const dir = options.base
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.html')) continue
        const path = join(dir, name)
        if (!statSync(path).isFile()) continue

        const contents = readFileSync(path, 'utf8')
        const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(contents)
        if (!m) throw new Error(`${path} has no front matter`)

        const id = name.replace(/\.html$/, '')
        const data = await parseData({
          id,
          data: (parseYaml(m[1]!) as Record<string, unknown>) ?? {},
          filePath: path,
        })
        // Hand-written HTML, so it never passes through the Markdown pipeline; the <img>
        // rules that posts get from rehype-images are applied here instead.
        const body = enhanceImgTags(expandIncludes(contents.slice(m[0].length), path))

        store.set({
          id,
          data,
          body,
          filePath: path,
          digest: generateDigest(contents),
          rendered: { html: body },
        })
      }
      watcher?.add(dir)
    },
  }
}

import type { Loader } from 'astro/loaders'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { expandIncludes } from '../lib/project-includes'

/**
 * Loads `_projects/*.html` — front matter plus a body that is already HTML.
 *
 * A dedicated loader rather than a Markdown one, for two reasons. The content layer has no
 * entry type for `.html`, so the glob loader just warns "No entry type found" and yields an
 * empty collection. And the bodies must not go through Markdown at all: they are hand-written
 * HTML, and running them through a Markdown processor would reflow the raw blocks. The body
 * is handed through verbatim — apart from the two `{% include %}` tags that
 * `_projects/minecraft.html` and `_projects/rdfjs.html` use, which are expanded by
 * `lib/project-includes.ts`. `_projects/*.html` stays byte-identical on disk.
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
        const body = expandIncludes(contents.slice(m[0].length), path)

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

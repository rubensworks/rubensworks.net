import type { AstroIntegration } from 'astro'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

/**
 * Splits Jekyll/Astro front matter from the body.
 *
 * Astro's own `safeParseFrontmatter` lives at `astro/dist/content/utils.js`, which the
 * package's `exports` map does not expose, so it cannot be imported — attempting it makes
 * every entry fail to load and the collection come back silently empty.
 */
function parseFrontmatter(contents: string, filePath: string) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(contents)
  if (!m) return { frontmatter: {}, content: contents, rawFrontmatter: '' }
  let frontmatter: Record<string, unknown>
  try {
    frontmatter = (parseYaml(m[1]!) as Record<string, unknown>) ?? {}
  } catch (err) {
    throw new Error(`Could not parse front matter in ${filePath}: ${(err as Error).message}`)
  }
  return { frontmatter, content: contents.slice(m[0].length), rawFrontmatter: m[1]! }
}

/**
 * Teaches the content layer to read `.markdown` files.
 *
 * `_posts/*.markdown` is an input file set that must stay as it is, and Astro's
 * `SUPPORTED_MARKDOWN_FILE_EXTENSIONS` does list `.markdown` — but that list drives
 * file-based routing under `src/pages`, not content collections. The content layer takes
 * its extensions from `settings.contentEntryTypes`, where the built-in Markdown entry type
 * registers `.md` only (`astro/dist/vite-plugin-markdown/content-entry-type.js`). Without
 * this, `glob({ pattern: '*.markdown' })` logs "No entry type found" for all six posts and
 * silently yields an empty collection.
 *
 * The entry type below is the built-in one with the extension list widened; behaviour is
 * otherwise identical, so posts go through exactly the same processor and plugins as any
 * other Markdown in the project.
 */
export function markdownExtension(): AstroIntegration {
  return {
    name: 'rubensworks:markdown-extension',
    hooks: {
      'astro:config:setup': ({ addContentEntryType }: any) => {
        addContentEntryType({
          extensions: ['.markdown'],
          getEntryInfo({ contents, fileUrl }: any) {
            const parsed = parseFrontmatter(contents, String(fileUrl))
            return {
              data: parsed.frontmatter,
              body: parsed.content.trim(),
              slug: parsed.frontmatter.slug,
              rawData: parsed.rawFrontmatter,
            }
          },
          // Markdown supports layouts, which pull in styles that must propagate.
          handlePropagation: true,
          async getRenderFunction(config: any) {
            const { markdown, image } = config
            const processor = await markdown.processor.createRenderer({
              image,
              syntaxHighlight: markdown.syntaxHighlight,
              shikiConfig: markdown.shikiConfig,
              gfm: markdown.gfm,
              smartypants: markdown.smartypants,
            })
            return async function renderToString(entry: any) {
              const result = await processor.render(entry.body ?? '', {
                frontmatter: entry.data,
                fileURL: entry.filePath ? pathToFileURL(entry.filePath) : undefined,
              })
              return {
                html: result.code,
                metadata: {
                  ...result.metadata,
                  imagePaths: result.metadata.localImagePaths.concat(
                    result.metadata.remoteImagePaths,
                  ),
                },
              }
            }
          },
        })
      },
    },
  }
}

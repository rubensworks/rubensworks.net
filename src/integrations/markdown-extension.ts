import type { AstroIntegration } from 'astro'
import { pathToFileURL } from 'node:url'
import { parse as parseYaml } from 'yaml'

/**
 * Splits the front matter from the body. Astro's own `safeParseFrontmatter` is not reachable
 * through the package's `exports` map.
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
 * Teaches the content layer to read `.markdown` files. Astro's own list registers `.md`
 * only, and `glob({ pattern: '*.markdown' })` otherwise logs "No entry type found" and
 * silently yields an empty collection. This is the built-in entry type with the extension
 * list widened, so posts go through the same processor and plugins as any other Markdown.
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

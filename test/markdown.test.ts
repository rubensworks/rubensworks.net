import { describe, it, expect } from 'vitest'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { remarkMarkdownAttribute } from '../src/lib/markdown/remark-markdown-attribute'
import { remarkInlineHtmlParagraph } from '../src/lib/markdown/remark-inline-html-paragraph'

// The same pipeline astro.config.mjs configures, driven directly so each kramdown
// construct can get a fixture instead of being checked only through a whole-page diff.
const processor = await createMarkdownProcessor({
  gfm: false,
  smartypants: true,
  remarkPlugins: [remarkMarkdownAttribute, remarkInlineHtmlParagraph],
})

const render = async (src: string) => (await processor.render(src)).code

describe('markdown="1" — span-level (kramdown content model)', () => {
  it('parses inline Markdown inside <p> and drops the attribute', async () => {
    const html = await render(
      '<p class="post-abstract" markdown="1">\nthe number of _qualitative_ projects\n</p>\n',
    )
    expect(html).toContain('<p class="post-abstract">')
    expect(html).toContain('<em>qualitative</em>')
    expect(html).not.toContain('markdown=')
    expect(html).not.toContain('_qualitative_')
  })

  it('does not wrap the content in a second paragraph', async () => {
    const html = await render('<p class="x" markdown="1">\nplain text\n</p>\n')
    expect(html.match(/<p/g)).toHaveLength(1)
  })

  it('keeps content that follows the element in the same HTML block', async () => {
    // Every post has <!--more--> on the line straight after </p>, with no blank line, so
    // CommonMark folds it into the same raw HTML block. Losing it loses the excerpt.
    const html = await render('<p class="a" markdown="1">\ntext\n</p>\n<!--more-->\n\n## Head\n')
    expect(html).toContain('<!--more-->')
    expect(html).toContain('<h2')
  })
})

describe('markdown="block" — block-level', () => {
  it('parses a fenced code block inside <figure> and drops the attribute', async () => {
    const html = await render(
      '<figure id="x" class="listing" markdown="block">\n```json\n{"a": 1}\n```\n</figure>\n',
    )
    expect(html).toContain('<figure id="x" class="listing">')
    expect(html).not.toContain('markdown=')
    expect(html).toContain('<pre')
    expect(html).toContain('</figure>')
  })

  it('parses inline Markdown inside <figcaption>', async () => {
    const html = await render(
      '<figcaption markdown="block">\n<span class="label">Listing 1</span>\nAdapted from [the playground](https://json-ld.org/playground/).\n</figcaption>\n',
    )
    expect(html).toContain('<a href="https://json-ld.org/playground/">the playground</a>')
    expect(html).not.toContain('markdown=')
  })

  it('handles a figure containing a nested figcaption', async () => {
    const html = await render(
      '<figure id="f" class="listing" markdown="block">\n' +
        '```json\n{"a": 1}\n```\n' +
        '<figcaption markdown="block">\n**bold** caption\n</figcaption>\n' +
        '</figure>\n',
    )
    expect(html).toContain('<figure id="f" class="listing">')
    expect(html).toContain('<figcaption>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).not.toContain('markdown=')
    // The outer </figure> must close after the caption, not before it.
    expect(html.indexOf('<figcaption')).toBeLessThan(html.lastIndexOf('</figure>'))
  })

  it('leaves raw HTML blocks without the attribute untouched', async () => {
    const html = await render('<div class="x">\n_not markdown_\n</div>\n')
    expect(html).toContain('_not markdown_')
  })
})

describe('kramdown block-level treatment of span-level raw HTML', () => {
  it('wraps a leading <span> block in a paragraph', async () => {
    const html = await render(
      '<span style="font-style:italic">\nAA Tower<br />\n9052 Ghent\n</span>\n',
    )
    expect(html).toContain('<p><span style="font-style:italic">')
  })
})

describe('GFM extensions are off, matching kramdown', () => {
  it('does not autolink an email inside a hand-written anchor', async () => {
    const html = await render('mail me via <a href="mailto:a@b.com">a@b.com</a>.\n')
    expect(html.match(/<a /g)).toHaveLength(1)
  })
})

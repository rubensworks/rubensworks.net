import { describe, it, expect } from 'vitest'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { markdownOptions } from '../src/lib/markdown/pipeline'

// The exact pipeline astro.config.mjs uses, driven directly so each kramdown construct gets
// a fixture of its own instead of being checked only through a whole-page diff.
const processor = await createMarkdownProcessor(markdownOptions as any)

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

describe('kramdown inline attribute lists', () => {
  it('applies a list that follows its own block', async () => {
    const html = await render('```\ncode\n```\n{:#preamble .hide}\n')
    expect(html).toContain('id="preamble"')
    expect(html).toContain('hide')
    expect(html).not.toContain('{:')
  })

  it('applies a list folded into the preceding list as a lazy continuation', async () => {
    // No blank line before `{:.cv-listing}`, so CommonMark makes it part of the last item.
    const html = await render('* one\n* two\n{:.cv-listing}\n')
    expect(html).toMatch(/<ul[^>]*class="cv-listing"/)
    expect(html).not.toContain('{:')
  })

  it('applies a list written on the line above its paragraph', async () => {
    const html = await render('{:.cv-biography}\nRuben Taelman is a professor.\n')
    expect(html).toMatch(/<p[^>]*class="cv-biography"/)
    expect(html).toContain('Ruben Taelman is a professor.')
    expect(html).not.toContain('{:')
  })
})

describe('raw HTML blocks end at their closing tag, as kramdown does', () => {
  it('keeps indented prose inside the element instead of making it a code block', async () => {
    // The whitespace-only line is what CommonMark would treat as ending the block; the
    // tab-indented line after it would then become an indented code block.
    const html = await render('<div class="books">\n  <p class="description">\n      \n\t   Some prose.\n  </p>\n</div>\n')
    expect(html).toContain('Some prose.')
    expect(html).not.toContain('<pre')
  })
})

describe('fenced code is content, not something to rewrite', () => {
  it('leaves a markdown="block" example inside a fence alone', async () => {
    const html = await render(
      'Here is how kramdown does it:\n\n```html\n<figure markdown="block">\n**bold**\n</figure>\n```\n',
    )
    const text = html.replace(/<[^>]*>/g, '')
    expect(text).toContain('markdown="block"')
    expect(text).toContain('**bold**')
    expect(html).not.toContain('<strong>')
  })

  it('still rewrites a real block after a fence that mentions one', async () => {
    const html = await render(
      '```html\n<figure markdown="block">x</figure>\n```\n\n<figcaption markdown="block">\n**bold**\n</figcaption>\n',
    )
    expect(html).toContain('<figcaption>')
    expect(html).toContain('<strong>bold</strong>')
  })
})

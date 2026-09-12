import { describe, it, expect } from 'vitest'
import { createMarkdownProcessor } from '@astrojs/markdown-remark'
import { imageInfo, enhanceImgTags } from '../src/lib/images'
import { markdownOptions } from '../src/lib/markdown/pipeline'

// Driven through the real files in public/, because that is what the rules read: the point
// of these attributes is that they describe the image that is actually shipped.
const processor = await createMarkdownProcessor(markdownOptions as any)
const render = async (src: string) => (await processor.render(src)).code

describe('reading an image', () => {
  it('reads the dimensions of a JPEG', () => {
    expect(imageInfo('/img/ruben.jpg')).toMatchObject({ width: 512, height: 512 })
  })

  it('reads the dimensions of a PNG', () => {
    expect(imageInfo('/img/blog/rdfjs.png')).toMatchObject({ width: 400, height: 400 })
  })

  it('reads an SVG that states its size in points, from its viewBox', () => {
    // dvisvgm writes `width='335.098805pt'` with single quotes; the pt value is not pixels
    // and the quotes are not the ones an attribute regex usually expects.
    expect(imageInfo('/img/blog/cost-modularity-sparql/bsbm-1k/plot_small.svg')).toMatchObject({
      width: 335,
      height: 110,
    })
  })

  it('reads an SVG that has only a viewBox', () => {
    expect(imageInfo('/img/logo_comunica.svg')).toMatchObject({ width: 250, height: 250 })
  })

  it('finds the AVIF and WebP written beside a raster image, best first', () => {
    expect(imageInfo('/img/ruben.jpg')!.sources).toEqual([
      { type: 'image/avif', src: '/img/ruben.avif' },
      { type: 'image/webp', src: '/img/ruben.webp' },
    ])
  })

  it('offers no alternatives for an SVG, which has none', () => {
    expect(imageInfo('/img/logo_comunica.svg')!.sources).toEqual([])
  })

  it('returns null for an image the build cannot see', () => {
    expect(imageInfo('/img/does-not-exist.png')).toBeNull()
    expect(imageInfo('https://example.org/x.png')).toBeNull()
    expect(imageInfo('//example.org/x.png')).toBeNull()
  })
})

describe('rewriting an <img> tag', () => {
  it('adds the size, lazy loading, and a <picture> around it', () => {
    const html = enhanceImgTags('<p><img src="/img/blog/rdfjs.png" alt="RDF/JS" /></p>')
    expect(html).toContain('<source srcset="/img/blog/rdfjs.avif" type="image/avif" />')
    expect(html).toContain('<source srcset="/img/blog/rdfjs.webp" type="image/webp" />')
    expect(html).toContain('width="400"')
    expect(html).toContain('height="400"')
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
  })

  it('loads a feature image eagerly — it is the largest paint, not something to defer', () => {
    const html = enhanceImgTags('<img src="/img/blog/apartments.jpg" alt="a" class="feature-img" />')
    expect(html).toContain('fetchpriority="high"')
    expect(html).not.toContain('loading="lazy"')
  })

  it('leaves an image the author sized alone', () => {
    const html = enhanceImgTags('<img src="/img/logo_ostrich.png" alt="OSTRICH" width="25%" />')
    expect(html).toContain('width="25%"')
    expect(html).not.toMatch(/height="\d/)
  })

  it('leaves an external image untouched', () => {
    const tag = '<img src="http://i.imgur.com/xEYeliA.jpg" alt="Contacts" class="screenshot" />'
    expect(enhanceImgTags(tag)).toBe(tag)
  })

  it('does not wrap an image that is already inside a <picture>', () => {
    const html = '<picture><source srcset="/img/ruben.avif" /><img src="/img/ruben.jpg" alt="R" /></picture>'
    expect(enhanceImgTags(html)).toBe(html)
  })
})

describe('images in a post', () => {
  it('treats a Markdown image the same as a hand-written tag', async () => {
    const html = await render('![RDF/JS](/img/blog/rdfjs.png)\n')
    expect(html).toContain('<picture>')
    expect(html).toContain('width="400" height="400"')
    expect(html).toContain('loading="lazy"')
  })

  it('reaches an image nested inside raw HTML', async () => {
    const html = await render(
      '<div class="plot">\n\t<div><img src="/img/blog/rdfjs.png" alt="x" /></div>\n</div>\n',
    )
    expect(html).toContain('width="400"')
    expect(html).toContain('class="plot"')
  })

  it('leaves an unresolvable image exactly as written', async () => {
    const html = await render('![x](/img/nope.png)\n')
    expect(html).toContain('<img src="/img/nope.png" alt="x">')
    expect(html).not.toContain('<picture>')
  })
})

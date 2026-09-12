// Port of feed.xml — the RSS feed, built by hand rather than with @astrojs/rss so the
// output stays byte-identical to what subscribers already have.
import type { APIRoute } from 'astro'
import { site, absoluteUrl } from '../site.config'
import { loadPosts } from '../lib/posts'
import { dateToRfc822 } from '../lib/dates'

/** Liquid's `xml_escape` — Ruby's CGI.escapeHTML, i.e. the five XML entities. */
const xmlEscape = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const GET: APIRoute = async () => {
  const posts = (await loadPosts()).slice(0, 10)
  const now = dateToRfc822(new Date())

  const items = posts
    .map((post) => {
      const url = absoluteUrl(post.url)
      const d = post.entry.data
      // Two Liquid loops — `post.tags` then `post.categories` — each leaving an indented
      // blank line around every iteration. Part of the feed as published.
      const categories = [
        ...d.tags.map((t) => `        \n        <category>${xmlEscape(t)}</category>`),
        '        ',
        `        \n        <category>${xmlEscape(d.categories)}</category>`,
        '        ',
      ].join('\n')
      // `{{ post.content | xml_escape }}` — the fully rendered post body.
      const content = post.entry.rendered?.html ?? ''
      // The `    ` line before each item and after the last is Liquid's `{% for %}`
      // whitespace, part of the feed as published.
      return `    
      <item>
        <title>${xmlEscape(d.title)}</title>
        <description>${xmlEscape(content)}</description>
        <pubDate>${dateToRfc822(post.date)}</pubDate>
        <link>${url}</link>
        <guid isPermaLink="true">${url}</guid>
${categories}
      </item>`
    })
    .join('\n')

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(site.title)}</title>
    <description>${xmlEscape(site.description)}</description>
    <link>${site.url}${site.baseurl}/</link>
    <atom:link href="${absoluteUrl('/feed.xml')}" rel="self" type="application/rss+xml"/>
    <pubDate>${now}</pubDate>
    <lastBuildDate>${now}</lastBuildDate>
    <generator>${site.generator}</generator>
${items}
    
  </channel>
</rss>
`

  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}

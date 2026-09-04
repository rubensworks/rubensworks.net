import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'
import { parseJekyllDate } from './lib/dates'
import { htmlCollection } from './loaders/html-collection'

/**
 * Both collections read the original Jekyll directories in place — `_posts/*.markdown` and
 * `_projects/*.html` stay byte-identical.
 *
 * `.markdown` is registered with the content layer by src/integrations/markdown-extension.ts,
 * and `_projects/*.html` is read by a small loader that passes the body through as HTML.
 */
const posts = defineCollection({
  loader: glob({ pattern: '*.markdown', base: './_posts' }),
  schema: z.object({
    layout: z.string(),
    categories: z.string(),
    tags: z.array(z.string()),
    comments: z.boolean().optional(),
    title: z.string(),
    subtitle: z.string().optional(),
    // A string under YAML 1.2; see parseJekyllDate.
    date: z.union([z.string(), z.date()]).transform(parseJekyllDate),
    feature_img: z.string().optional(),
    author: z.string().optional(),
  }),
})

const projects = defineCollection({
  loader: htmlCollection({ base: './_projects' }),
  schema: z.object({
    layout: z.string(),
    title: z.string(),
    description: z.string().optional(),
    weight: z.number().optional(),
    start: z.union([z.string(), z.number()]).optional(),
    end: z.union([z.string(), z.number()]).optional(),
  }),
})

export const collections = { posts, projects }

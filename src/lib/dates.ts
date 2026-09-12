// Date formatting for post bylines, publication dates and the feed. All UTC, so a date
// renders the same wherever the build runs.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const pad = (n: number) => String(n).padStart(2, '0')

/** Liquid `date_to_xmlschema`, e.g. `2019-03-13T12:00:00+00:00`. */
export function dateToXmlSchema(d: Date): string {
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  )
}

/** Liquid `date_to_rfc822`, e.g. `Wed, 13 Mar 2019 12:00:00 +0000`. */
export function dateToRfc822(d: Date): string {
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)} ` +
    `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} +0000`
  )
}

/** Liquid `date: "%-d %B %Y"`, e.g. `13 March 2019` — day number is not zero-padded. */
export function dateLong(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** `permalink: pretty` with `categories: blog` — /blog/yyyy/mm/dd/slug/. */
export function postUrl(date: Date, slug: string): string {
  return `/blog/${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())}/${slug}/`
}

/**
 * Parses a front-matter date, e.g. `2019-03-13 14:00:00 +0200`. YAML 1.2 has no timestamp
 * type so it arrives as a string, and `new Date(...)` handles this format unpredictably.
 */
export function parseFrontMatterDate(value: string | Date): Date {
  if (value instanceof Date) return value
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\s*([+-])(\d{2}):?(\d{2}))?$/.exec(
    value.trim(),
  )
  if (!m) throw new Error(`Unrecognised front-matter date: ${value}`)
  const [, y, mo, d, h, mi, sec, sign, oh, om] = m
  const offset = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om)) : 0
  return new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(sec)) -
      offset * 60_000,
  )
}

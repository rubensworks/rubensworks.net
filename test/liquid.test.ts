import { describe, it, expect } from 'vitest'
import { renderLiquid } from '../src/lib/liquid-pages'

// Driven through the real _data/*.yml, because the Liquid subset only compares a resolved
// variable against a string literal — there is no way to write a bare boolean.
const render = (src: string) => renderLiquid(src, 'test.md', async (md) => md)

const NONE = '__not-a-student__'
const forEachPhd = (body: string) =>
  `{% for p in site.data.studentsphd %}${body}{% endfor %}`

describe('nested blocks bind to their own closing tag', () => {
  it('does not let an inner {% for %} steal the outer {% endfor %}', async () => {
    const out = await render(
      forEachPhd('[{% for m in site.data.studentsmaster %}x{% endfor %}]'),
    )
    const outer = out.split('[').length - 1
    expect(outer).toBeGreaterThan(1)
    // Every outer iteration ran the whole inner loop, and the outer body closed each time.
    expect(out.match(/x/g)!.length % outer).toBe(0)
    expect(out).toMatch(/^(\[x+\])+$/)
  })

  it('does not let an inner {% if %} steal the outer {% endif %}', async () => {
    const out = await render(
      forEachPhd(`{% if p[0] != "${NONE}" %}A{% if p[0] == "${NONE}" %}B{% endif %}C{% endif %}`),
    )
    expect(out).toMatch(/^(AC)+$/)
  })
})

describe('{% if %} operator folding', () => {
  // Liquid has no precedence between `and` and `or`; it folds right to left. C precedence
  // would read `false and true or true` as `(false and true) or true` — true — where Liquid
  // reads it as `false and (true or true)`, which is false.
  it('reads `a and b or c` as `a and (b or c)`', async () => {
    const F = `p[0] == "${NONE}"`
    const T = `p[0] != "${NONE}"`
    expect(await render(forEachPhd(`{% if ${F} and ${T} or ${T} %}Y{% endif %}`))).toBe('')
    expect(await render(forEachPhd(`{% if ${T} and ${T} or ${F} %}Y{% endif %}`))).toMatch(/^Y+$/)
  })

  it('still handles a plain chain of ors, which is all cv.md uses', async () => {
    const F = `p[0] == "${NONE}"`
    const T = `p[0] != "${NONE}"`
    expect(await render(forEachPhd(`{% if ${F} or ${T} %}Y{% endif %}`))).toMatch(/^Y+$/)
    expect(await render(forEachPhd(`{% if ${F} or ${F} %}Y{% endif %}`))).toBe('')
  })
})

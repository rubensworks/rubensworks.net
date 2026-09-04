#!/usr/bin/env node
// Crops a region out of the golden and new screenshots and stacks them for eyeballing.
//
//   node verify/crop.mjs <dir> <slug> <viewport> <y> <height> [out.png]
//
// Used for the one part of the migration that a diff cannot settle: whether the Shiki theme
// built from the Rouge palette actually looks like the Rouge output (plan §6.7).

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const [dir, slug, vp, yRaw, hRaw, out = '/tmp/crop.png'] = process.argv.slice(2)
const y = Number(yRaw)
const h = Number(hRaw)

const b64 = (p) => readFileSync(p).toString('base64')
const golden = b64(join(dir, `${slug}-${vp}-golden.png`))
const nw = b64(join(dir, `${slug}-${vp}-new.png`))

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage()
const png = await page.evaluate(
  async ([a, b, y, h]) => {
    const load = (d) =>
      new Promise((res) => {
        const img = new Image()
        img.onload = () => res(img)
        img.src = 'data:image/png;base64,' + d
      })
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const w = Math.max(ia.width, ib.width)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h * 2 + 40
    const g = c.getContext('2d')
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    g.drawImage(ia, 0, y, w, h, 0, 20, w, h)
    g.drawImage(ib, 0, y, w, h, 0, h + 40, w, h)
    g.fillStyle = '#000'
    g.font = '16px sans-serif'
    g.fillText('JEKYLL (golden)', 8, 14)
    g.fillText('ASTRO (new)', 8, h + 34)
    g.strokeStyle = '#c00'
    g.beginPath()
    g.moveTo(0, h + 25)
    g.lineTo(w, h + 25)
    g.stroke()
    return c.toDataURL('image/png').split(',')[1]
  },
  [golden, nw, y, h],
)
await browser.close()
writeFileSync(out, Buffer.from(png, 'base64'))
console.log(`wrote ${out}`)

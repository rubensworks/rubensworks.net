/**
 * Expands the two `{% include %}` tags that survive inside `_projects/*.html`.
 *
 * `_projects/minecraft.html` uses `minecraft-mod.html` 16 times and
 * `_projects/rdfjs.html` uses `rdfjs-software.html`. Everything else in those files is
 * plain HTML, which is why the collection loader otherwise passes bodies straight through.
 *
 * The two templates are inlined here rather than made into .astro components, because the
 * bodies are handled as raw HTML strings and never go through Astro's renderer. The
 * expansion is deliberately strict: an unknown include name, or a `{%` that is left over
 * afterwards, throws rather than shipping a Liquid tag to a visitor.
 */

type Params = Record<string, string>

const TEMPLATES: Record<string, (p: Params) => string> = {
  // _includes/minecraft-mod.html
  'minecraft-mod.html': (p) => `<div class="mcmod-widget">
<h3><a href="https://www.curseforge.com/minecraft/mc-mods/${p.cursename}/" target="_blank">${p.name}</a></h3>
<p class="description">
  ${p.description}
</p>

<a href="https://www.curseforge.com/minecraft/mc-mods/${p.cursename}/files/latest" target="_blank" class="download">Download latest</a>
<a href="https://www.curseforge.com/minecraft/mc-mods/${p.cursename}/files" target="_blank" class="download">All downloads</a>
<a href="https://bintray.com/cyclopsmc/dev/${p.githubreponame}" target="_blank" class="download">Dev builds</a>
<a href="https://github.com/CyclopsMC/${p.githubreponame}" target="_blank" class="download">Source</a>

</div>`,

  // _includes/rdfjs-software.html
  'rdfjs-software.html': (p) => `<div class="rdfjs-widget">
<h3><a href="https://github.com/${p.githubreponame}" target="_blank">${p.name}</a></h3>
<p class="description">
  ${p.description}
</p>

<a href="https://www.npmjs.com/package/${p.npmname}" target="_blank" class="download">NPM</a>
<a href="https://github.com/${p.githubreponame}" target="_blank" class="download">Source</a>

</div>`,
}

const INCLUDE = /\{%\s*include\s+([\w.-]+)\s*([\s\S]*?)%\}/g

function parseParams(raw: string): Params {
  const params: Params = {}
  const re = /([a-zA-Z_][\w-]*)\s*=\s*"([^"]*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) params[m[1]!] = m[2]!
  return params
}

export function expandIncludes(body: string, filePath: string): string {
  const out = body.replace(INCLUDE, (_, name: string, rawParams: string) => {
    const template = TEMPLATES[name]
    if (!template) throw new Error(`${filePath}: no port of {% include ${name} %}`)
    return template(parseParams(rawParams))
  })
  if (out.includes('{%') || out.includes('{{')) {
    throw new Error(`${filePath}: Liquid syntax left after expanding includes`)
  }
  return out
}

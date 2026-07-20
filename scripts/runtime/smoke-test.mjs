import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  flattenSvgColors,
  normalizeArrowMarkers,
  normalizeMarkerPolylinePoints,
  renderDiagram,
} from './render.mjs'
import { inspectSvg } from './inspect-svg.mjs'

const fixtures = {
  flowchart: 'graph LR\n    A[Input] --> B{Valid?}\n    B -->|Yes| C[Output]\n',
  state: 'stateDiagram-v2\n    direction LR\n    [*] --> Ready\n    Ready --> Done\n',
  sequence: 'sequenceDiagram\n    Client->>API: Request\n    API-->>Client: Response\n',
  class: 'classDiagram\n    Animal <|-- Dog\n    class Dog {\n      +bark() void\n    }\n',
  er: 'erDiagram\n    USER ||--o{ ORDER : places\n',
  xy: 'xychart-beta\n    x-axis [A, B, C]\n    bar [10, 20, 30]\n    line [8, 18, 26]\n',
}

const root = await mkdtemp(join(tmpdir(), 'craft-mermaid-'))
let diagramsWithAccent = 0

for (const [name, source] of Object.entries(fixtures)) {
  const input = join(root, `${name}.mmd`)
  const output = join(root, `${name}-output`)
  await writeFile(input, source, 'utf8')
  const result = await renderDiagram({
    input,
    outDir: output,
    theme: name === 'state' ? 'craft-dark' : 'craft-light',
  })

  assert.equal(result.valid, true, `${name}: ${result.errors.join(' ')}`)
  assert.ok(result.artifacts.png)
  assert.ok(result.raster.readablePixels > 20, `${name}: preview has no readable palette content`)
  assert.equal(result.raster.scale, 3, `${name}: preview should render at 3x pixel density`)
  assert.deepEqual((await readdir(output)).sort(), [`${name}.mmd`, `${name}.png`])
  if (['flowchart', 'state', 'sequence'].includes(name)) {
    assert.ok(result.metrics.directedEdges > 0, `${name}: fixture should contain directed edges`)
    assert.ok(result.metrics.arrowMarkerReferences > 0, `${name}: fixture should reference arrow markers`)
  }
  if (result.raster.accentPixels > 3) diagramsWithAccent += 1
  const png = await readFile(result.artifacts.png)
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
}

assert.ok(diagramsWithAccent >= 3, 'Rendered fixture set does not exercise enough accent-colored content')

const missingMarkerInspection = inspectSvg(`
  <svg width="100" height="100">
    <polyline data-arrow-end="true" marker-end="url(#missing)" points="0,0 10,10" />
  </svg>
`)
assert.equal(missingMarkerInspection.valid, false)
assert.match(missingMarkerInspection.errors.join(' '), /missing SVG markers: missing/)

const missingReferenceInspection = inspectSvg(`
  <svg width="100" height="100">
    <polyline data-arrow-end="true" points="0,0 10,10" />
  </svg>
`)
assert.equal(missingReferenceInspection.valid, false)
assert.match(missingReferenceInspection.errors.join(' '), /do not reference an SVG arrow marker/)

const normalizedMarker = normalizeArrowMarkers(`
  <svg><defs><marker id="arrowhead" markerWidth="8" markerHeight="5" refX="7" refY="2.5">
    <polygon points="0 0, 8 2.5, 0 5" />
  </marker></defs></svg>
`)
assert.match(normalizedMarker, /markerWidth="9" markerHeight="6"[^>]*refX="9"[^>]*markerUnits="userSpaceOnUse"/)
assert.match(normalizedMarker, /points="0 0, 9 3, 0 6"/)

const normalizedSequenceMarker = normalizeArrowMarkers(`
  <svg><defs><marker id="seq-arrow" markerWidth="8" markerHeight="5" refX="8" refY="2.5">
    <polygon points="0 0, 8 2.5, 0 5" />
  </marker></defs></svg>
`)
assert.match(normalizedSequenceMarker, /markerWidth="12" markerHeight="8"[^>]*refX="12"[^>]*markerUnits="userSpaceOnUse"/)
assert.match(normalizedSequenceMarker, /points="0 0, 12 4, 0 8"/)

const normalizedPolyline = normalizeMarkerPolylinePoints(`
  <svg>
    <polyline marker-end="url(#arrowhead)" points="0,0 0,100 0.0000001,100" />
    <polyline marker-start="url(#arrowhead-start)" points="20,0 20.0000001,0 20,100" />
    <polyline points="40,0 40,100 40.0000001,100" />
  </svg>
`)
assert.match(normalizedPolyline, /marker-end="url\(#arrowhead\)" points="0,0 0,100"/)
assert.match(normalizedPolyline, /marker-start="url\(#arrowhead-start\)" points="20,0 20,100"/)
assert.match(normalizedPolyline, /<polyline points="40,0 40,100 40\.0000001,100"/)
assert.equal(
  flattenSvgColors('<svg style="--accent: #8453ed"><polygon fill="var(--_arrow)" /></svg>', {
    bg: '#f7f8fa',
    fg: '#111317',
    accent: '#8453ed',
    line: '#aaabaf',
    muted: '#797b7f',
    surface: '#eff0f3',
    border: '#c3c4c7',
  }).includes('var('),
  false,
)

const invalidInput = join(root, 'invalid.mmd')
await writeFile(invalidInput, 'pie\n    "A" : 1\n', 'utf8')
const invalidReport = await renderDiagram({
  input: invalidInput,
  outDir: join(root, 'invalid-output'),
  theme: 'craft-light',
})
assert.equal(invalidReport.valid, false)
assert.match(invalidReport.errors.join(' '), /Unsupported diagram type/)
assert.deepEqual(invalidReport.artifacts, {})

const collisionInput = join(root, 'collision.mmd')
const collisionSource = '---\ntitle: Collision safety\n---\ngraph LR\n    A --> B\n'
await writeFile(collisionInput, collisionSource, 'utf8')
const collisionReport = await renderDiagram({
  input: collisionInput,
  outDir: root,
  theme: 'craft-light',
})
assert.equal(collisionReport.valid, true)
assert.notEqual(collisionReport.artifacts.source, collisionInput)
assert.equal(await readFile(collisionInput, 'utf8'), collisionSource)
assert.match(collisionReport.artifacts.source, /collision\.normalized\.mmd$/)

console.log(`Craft Mermaid runtime smoke tests passed (${Object.keys(fixtures).length} diagram types).`)

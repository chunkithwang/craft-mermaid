import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { flattenSvgColors, normalizeArrowMarkers, renderDiagram } from './render.mjs'
import { inspectSvg } from './inspect-svg.mjs'
import { recordReview } from './record-review.mjs'

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
  const report = await renderDiagram({
    input,
    outDir: output,
    theme: name === 'state' ? 'craft-dark' : 'craft-light',
    format: 'all',
    maxWidth: 1600,
    maxHeight: 1200,
  })

  assert.equal(report.valid, true, `${name}: ${report.errors.join(' ')}`)
  assert.ok(report.artifacts.svg)
  assert.ok(report.artifacts.png)
  assert.ok(report.raster.readablePixels > 20, `${name}: preview has no readable palette content`)
  const svg = await readFile(report.artifacts.svg, 'utf8')
  assert.doesNotMatch(svg, /var\(|color-mix\(/i, `${name}: portable SVG contains unresolved colors`)
  if (['flowchart', 'state', 'sequence'].includes(name)) {
    assert.ok(report.metrics.directedEdges > 0, `${name}: fixture should contain directed edges`)
    assert.ok(report.metrics.arrowMarkerReferences > 0, `${name}: fixture should reference arrow markers`)
    assert.match(svg, /markerWidth="12" markerHeight="8"[^>]*markerUnits="userSpaceOnUse"/)
  }
  if (report.raster.accentPixels > 3) diagramsWithAccent += 1
  const png = await readFile(report.artifacts.png)
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
assert.match(normalizedMarker, /markerWidth="12" markerHeight="8"[^>]*markerUnits="userSpaceOnUse"/)
assert.match(normalizedMarker, /points="0 0, 12 4, 0 8"/)
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
  format: 'all',
  maxWidth: 1600,
  maxHeight: 1200,
})
assert.equal(invalidReport.valid, false)
assert.match(invalidReport.errors.join(' '), /Unsupported diagram type/)

const collisionInput = join(root, 'collision.mmd')
const collisionSource = '---\ntitle: Collision safety\n---\ngraph LR\n    A --> B\n'
await writeFile(collisionInput, collisionSource, 'utf8')
const collisionReport = await renderDiagram({
  input: collisionInput,
  outDir: root,
  theme: 'craft-light',
  format: 'svg',
  maxWidth: 1600,
  maxHeight: 1200,
})
assert.equal(collisionReport.valid, true)
assert.notEqual(collisionReport.artifacts.source, collisionInput)
assert.equal(await readFile(collisionInput, 'utf8'), collisionSource)
assert.match(collisionReport.artifacts.source, /collision\.normalized\.mmd$/)

const reviewPath = join(root, 'collision.visual-review.json')
await writeFile(reviewPath, `${JSON.stringify({
  status: 'passed',
  round: 1,
  scores: {
    semanticCoverage: 5,
    legibility: 5,
    layout: 5,
    grouping: 4,
    density: 4,
  },
  issues: [],
}, null, 2)}\n`, 'utf8')
const reviewedReport = await recordReview(collisionReport.artifacts.report, reviewPath)
assert.equal(reviewedReport.visualReview.status, 'passed')
assert.equal(JSON.parse(await readFile(collisionReport.artifacts.report, 'utf8')).visualReview.status, 'passed')

console.log(`Craft Mermaid runtime smoke tests passed (${Object.keys(fixtures).length} diagram types).`)

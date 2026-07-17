import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderDiagram } from './render.mjs'
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
  if (report.raster.accentPixels > 3) diagramsWithAccent += 1
  const png = await readFile(report.artifacts.png)
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG')
}

assert.ok(diagramsWithAccent >= 3, 'Rendered fixture set does not exercise enough accent-colored content')

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

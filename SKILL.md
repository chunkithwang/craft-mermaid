---
name: craft-mermaid
description: Create, render, and visually verify Craft-style Mermaid diagrams with the same beautiful-mermaid layout engine and matching light/dark palettes. Use for architecture, workflows, state transitions, API sequences, class models, entity relationships, XY charts, Mermaid code fences, .mmd files, or whenever a diagram would materially improve an explanation in Codex, Claude Code, or another shell-capable agent.
---

# Craft Mermaid

Create focused Mermaid diagrams and deterministic SVG/PNG artifacts using the
same renderer family as Craft Agents. Treat the rendered artifact, not the host
client's Mermaid preview, as the portable visual result.

## Preserve Craft Compatibility

- Use only `graph`/`flowchart`, `stateDiagram-v2`, `sequenceDiagram`,
  `classDiagram`, `erDiagram`, and `xychart-beta` in compatibility mode.
- Render with the bundled runtime and its pinned `beautiful-mermaid` version.
- Do not silently fall back to Mermaid CLI, Kroki, or another renderer.
- Avoid custom `style` and `classDef` directives unless the user asks for them;
  they override the portable Craft palette.
- Quote labels containing punctuation, brackets, parentheses, or colons.
- Keep one concept per diagram. Split dense diagrams instead of shrinking text.
- Prefer `LR` for small flows and processes. Prefer `TD` for deep hierarchies or
  large graphs whose horizontal layout would become excessively wide.

Read [references/syntax.md](references/syntax.md) when selecting or authoring a
diagram type. Read
[references/visual-review.md](references/visual-review.md) before reviewing a
rendered preview or repairing a diagram after review.

## Workflow

1. Extract the entities, relationships, order, and labels from the request.
2. Select the narrowest supported diagram type that expresses the information.
3. Write the source to a `.mmd` file in the user's requested output directory.
4. Resolve this skill's directory and check for
   `scripts/runtime/node_modules`. If dependencies are absent, ask before
   running `npm ci` in `scripts/runtime`; dependency installation can require
   network access and modifies the skill directory.
5. Render and validate with:

   ```bash
   node <skill-dir>/scripts/runtime/render.mjs \
     --input <diagram.mmd> \
     --out-dir <output-directory> \
     --theme craft-light \
     --format all \
     --json
   ```

6. Read the generated report. Stop and repair syntax when `valid` is false.
7. Inspect the generated PNG using the host's image-inspection capability when
   one exists. Judge it using `references/visual-review.md`; never infer visual
   quality from Mermaid source alone.
8. Save the structured result as `<name>.visual-review.json`, then attach it to
   the render report with:

   ```bash
   node <skill-dir>/scripts/runtime/record-review.mjs \
     --report <name>.report.json \
     --review <name>.visual-review.json \
     --json
   ```

9. Repair and re-render at most twice. Preserve semantics while fixing layout.
10. Deliver the `.mmd`, `.svg`, `.png`, and `.report.json` artifacts. Embed or
   link the SVG/PNG when the host supports it. Include a Mermaid code fence only
   as editable source; a host renderer may produce a different appearance.

## Render Options

Use `craft-light` unless the user requests dark output. Use `craft-dark` for a
dark artifact. The runtime supports:

```text
--input <path>             Required Mermaid source
--out-dir <path>           Required artifact directory
--theme craft-light|craft-dark
--format svg|png|all       Default: all
--max-width <pixels>       Default: 1600
--max-height <pixels>      Default: 1200
--json                     Print the report as JSON
```

The runtime writes normalized Mermaid source beside the rendered artifacts. It
uses YAML frontmatter only as input metadata and removes it before rendering,
matching the Craft renderer pipeline. When the output directory is also the
input directory, it writes `<name>.normalized.mmd` instead of overwriting the
original source.

## Visual Review

- Review the PNG, not a screenshot from a different Mermaid renderer.
- Check clipping, overlap, legibility, grouping, direction, whitespace, and
  semantic coverage.
- Modify layout before shortening meaningful labels.
- Mark visual review as `skipped` when the host cannot inspect images. Run
  `inspect-svg.mjs` for deterministic checks, but do not claim visual approval.
- Report unresolved issues after two repair rounds instead of looping.

Run deterministic SVG inspection independently when needed:

```bash
node <skill-dir>/scripts/runtime/inspect-svg.mjs <diagram.svg> --json
```

## Failure Rules

- If the renderer rejects a diagram, return the exact diagnostic and revise it.
- If a requested diagram type is unsupported, explain that Craft-compatible
  mode cannot preserve the requested type. Ask before using another renderer.
- If dependency installation is unavailable, still provide `.mmd` source and
  state clearly that rendering and visual review were not performed.
- Never describe a diagram as validated merely because the source looks valid.

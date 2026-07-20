---
name: craft-mermaid
description: Create, render, and visually verify Craft-style Mermaid diagrams with the same beautiful-mermaid layout engine and matching light/dark palettes. Use for architecture, workflows, state transitions, API sequences, class models, entity relationships, XY charts, Mermaid code fences, .mmd files, Craft Mermaid installation, updates, or runtime repair, or whenever a diagram would materially improve an explanation in Codex, Claude Code, or another shell-capable agent.
---

# Craft Mermaid

Create focused Mermaid diagrams and deterministic high-resolution PNG artifacts
using the same renderer family as Craft Agents. Treat the rendered PNG, not the
host client's Mermaid preview, as the portable visual result.

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

## Complete Installation and Updates

Do not treat a Craft Mermaid installation or update as complete when only the
Skill files have been copied.

After `skills add`, resolve the actual installed Skill directory from the
installer's output. Obtain approval when required because dependency setup can
use the network and modifies that directory, then run:

```bash
node <installed-skill-dir>/scripts/setup-runtime.mjs
```

When asked to update Craft Mermaid:

1. Determine whether the installed copy is project-level or global. Run
   `npx skills update craft-mermaid --project` or
   `npx skills update craft-mermaid --global` with the matching explicit scope.
2. Read the update result. If Craft Mermaid is already current, report that and
   do not reinstall dependencies.
3. If Craft Mermaid was updated, resolve the updated Skill directory. Skills CLI
   replaces the directory and does not restore `scripts/runtime/node_modules`.
4. Obtain dependency-installation approval when required, then run
   `node <installed-skill-dir>/scripts/setup-runtime.mjs` before declaring the
   update complete.

The setup entry point checks Node.js compatibility, runs `npm ci` against the
bundled lockfile, and runs the smoke test. Report the installed directory and
test result. Treat a setup or test failure as an incomplete installation or
update.

## Workflow

1. Extract the entities, relationships, order, and labels from the request.
2. Select the narrowest supported diagram type that expresses the information.
3. Write the source to a `.mmd` file in the user's requested output directory.
4. Resolve this skill's directory and check for
   `scripts/runtime/node_modules`. If dependencies are absent, ask before
   running `node <skill-dir>/scripts/setup-runtime.mjs`; dependency installation
   can require network access and modifies the skill directory. Do not continue
   to rendering unless its smoke test succeeds.
5. Render and validate with:

   ```bash
   node <skill-dir>/scripts/runtime/render.mjs \
     --input <diagram.mmd> \
     --out-dir <output-directory> \
     --theme craft-light \
     --json
   ```

6. Read the JSON validation result from stdout. Stop and repair syntax when
   `valid` is false. Do not save it as a report artifact.
7. Inspect the generated PNG using the host's image-inspection capability when
   one exists. Judge it using `references/visual-review.md`; never infer visual
   quality from Mermaid source alone.
8. Keep the structured visual-review result in the current reasoning context;
   do not write a separate review or render-report file.
9. Repair and re-render at most twice. Preserve semantics while fixing layout.
10. Deliver only the `.mmd` and `.png` artifacts. Embed or link the PNG when the
    host supports it. Include a Mermaid code fence only as editable source; a
    host renderer may produce a different appearance.

## Render Options

Use `craft-light` unless the user requests dark output. Use `craft-dark` for a
dark artifact. The runtime supports:

```text
--input <path>             Required Mermaid source
--out-dir <path>           Required artifact directory
--theme craft-light|craft-dark
--scale <factor>           Default: 3
--max-width <pixels>       Default: 4096
--max-height <pixels>      Default: 3072
--json                     Print validation details to stdout
```

The runtime writes normalized Mermaid source beside the high-resolution PNG. It
uses an in-memory SVG for deterministic validation and rasterization but does
not save or deliver that intermediate representation. YAML frontmatter is used
only as input metadata and removed before rendering, matching the Craft renderer
pipeline. When the output directory is also the input directory, the runtime
writes `<name>.normalized.mmd` instead of overwriting the original source.

## Visual Review

- Review the PNG, not a screenshot from a different Mermaid renderer.
- Check clipping, overlap, legibility, grouping, direction, whitespace, and
  semantic coverage.
- Modify layout before shortening meaningful labels.
- Mark visual review as `skipped` when the host cannot inspect images. The
  renderer still performs deterministic checks on its in-memory SVG, but those
  checks do not constitute visual approval.
- Report unresolved issues after two repair rounds instead of looping.

## Failure Rules

- If the renderer rejects a diagram, return the exact diagnostic and revise it.
- If a requested diagram type is unsupported, explain that Craft-compatible
  mode cannot preserve the requested type. Ask before using another renderer.
- If dependency installation is unavailable, still provide `.mmd` source and
  state clearly that rendering and visual review were not performed.
- Never describe a diagram as validated merely because the source looks valid.

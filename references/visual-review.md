# Visual Review Protocol

Review the PNG generated from the same `beautiful-mermaid` SVG that will be
delivered. Do not review a host-rendered Mermaid code fence.

## Review Order

1. Confirm that every required entity and relationship is represented.
2. Check for clipped text, truncated edges, overlaps, and detached labels.
3. Check whether text remains readable at normal viewing size.
4. Check whether the chosen direction matches the structure.
5. Check grouping, whitespace, edge crossings, and visual hierarchy.
6. Check whether the diagram communicates one primary concept.

## Scoring

Score each category from 1 to 5:

| Category | Passing score | Meaning |
|---|---:|---|
| Semantic coverage | 4 | Required content and relationships are present |
| Legibility | 4 | Labels and arrows can be read without zooming excessively |
| Layout | 4 | No collisions, clipping, or unnecessary crossings |
| Grouping | 3 | Boundaries and related elements are visually coherent |
| Density | 3 | The diagram is neither cramped nor wastefully sparse |

Fail when any critical clipping or overlap exists, or when semantic coverage is
below 4. Otherwise pass only when the average score is at least 3.6.

## Required Result

Return this structure in the agent's reasoning or artifact report:

```json
{
  "status": "passed",
  "round": 1,
  "scores": {
    "semanticCoverage": 5,
    "legibility": 4,
    "layout": 4,
    "grouping": 4,
    "density": 4
  },
  "issues": []
}
```

For a failure, include evidence tied to visible elements and a specific repair:

```json
{
  "status": "failed",
  "round": 1,
  "scores": {
    "semanticCoverage": 4,
    "legibility": 2,
    "layout": 2,
    "grouping": 3,
    "density": 2
  },
  "issues": [
    {
      "severity": "high",
      "category": "overlap",
      "evidence": "The Payment label overlaps the edge entering Order DB.",
      "repair": "Move Payment into a separate subgraph or change the flow to TD."
    }
  ]
}
```

Use `status: "skipped"` when the host cannot inspect images. A deterministic SVG
inspection is not a visual review.

## Repair Policy

- Preserve entities and relationship semantics.
- Change direction, split subgraphs, or split the diagram before abbreviating
  important labels.
- Remove decorative styling before removing information.
- Perform no more than two automatic repair rounds.
- Report remaining issues honestly after the final round.

#!/usr/bin/env node

import { readFile, realpath } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const EXTERNAL_URL_RE = /(?:href|xlink:href)\s*=\s*["'](https?:\/\/|\/\/)/gi
const EVENT_HANDLER_RE = /\son[a-z]+\s*=/gi

export function parseSvgDimensions(svg) {
  const width = Number(svg.match(/<svg\b[^>]*\bwidth=["']([\d.]+)(?:px)?["']/i)?.[1])
  const height = Number(svg.match(/<svg\b[^>]*\bheight=["']([\d.]+)(?:px)?["']/i)?.[1])
  const viewBoxMatch = svg.match(/<svg\b[^>]*\bviewBox=["']([^"']+)["']/i)
  const viewBox = viewBoxMatch?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number)

  const validViewBox = viewBox?.length === 4 && viewBox.every(Number.isFinite)
  const resolvedWidth = Number.isFinite(width) && width > 0
    ? width
    : validViewBox
      ? viewBox[2]
      : NaN
  const resolvedHeight = Number.isFinite(height) && height > 0
    ? height
    : validViewBox
      ? viewBox[3]
      : NaN

  if (!Number.isFinite(resolvedWidth) || !Number.isFinite(resolvedHeight)) {
    return null
  }

  return {
    width: resolvedWidth,
    height: resolvedHeight,
    viewBox: validViewBox ? viewBox : null,
    aspectRatio: resolvedWidth / resolvedHeight,
  }
}

export function sanitizeGeneratedSvg(svg) {
  return svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
    .replace(/\s(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '')
}

export function inspectSvg(svg) {
  const warnings = []
  const errors = []
  const dimensions = parseSvgDimensions(svg)

  if (!/^\s*<svg\b/i.test(svg)) errors.push('Output does not start with an SVG root element.')
  if (!dimensions) errors.push('SVG has no valid width/height or viewBox dimensions.')
  if (/<script\b/i.test(svg)) errors.push('SVG contains a script element.')
  if (EVENT_HANDLER_RE.test(svg)) errors.push('SVG contains an inline event handler.')
  EVENT_HANDLER_RE.lastIndex = 0
  if (/var\(|color-mix\(/i.test(svg)) errors.push('SVG contains unresolved CSS colors; portable output must use concrete color values.')
  if (EXTERNAL_URL_RE.test(svg)) warnings.push('SVG contains an external URL reference.')
  EXTERNAL_URL_RE.lastIndex = 0
  if (/@import\s+url\(\s*["']?https?:\/\//i.test(svg)) warnings.push('SVG imports a remote font; offline viewers will use a system-font fallback.')
  if (/<foreignObject\b/i.test(svg)) warnings.push('SVG contains foreignObject content; verify host compatibility.')

  const markerIds = new Set(
    [...svg.matchAll(/<marker\b[^>]*\bid=["']([^"']+)["']/gi)].map(match => match[1]),
  )
  const edgeTags = [...svg.matchAll(/<(?:path|polyline|line)\b[^>]*>/gi)].map(match => match[0])
  const semanticDirectedEdgeTags = edgeTags.filter(tag => /\bdata-arrow-(?:start|end)=["']true["']/i.test(tag))
  const markerEdgeTags = edgeTags.filter(tag => /\bmarker-(?:start|end)=["']url\(#/i.test(tag))
  const directedEdgeTags = [...new Set([...semanticDirectedEdgeTags, ...markerEdgeTags])]
  const arrowMarkerReferences = markerEdgeTags.flatMap(tag =>
    [...tag.matchAll(/\bmarker-(?:start|end)=["']url\(#([^)'"\s]+)\)["']/gi)].map(reference => reference[1]),
  )
  const unresolvedArrowMarkers = [...new Set(arrowMarkerReferences.filter(id => !markerIds.has(id)))]

  if (semanticDirectedEdgeTags.some(tag => !/\bmarker-(?:start|end)=["']url\(#/i.test(tag))) {
    errors.push('One or more directed edges do not reference an SVG arrow marker.')
  }
  if (unresolvedArrowMarkers.length > 0) {
    errors.push(`Directed edges reference missing SVG markers: ${unresolvedArrowMarkers.join(', ')}.`)
  }

  if (dimensions?.aspectRatio > 3) {
    warnings.push(`Diagram is very wide (${dimensions.aspectRatio.toFixed(2)}:1); review text size and horizontal flow.`)
  }
  if (dimensions?.aspectRatio < 0.4) {
    warnings.push(`Diagram is very tall (${dimensions.aspectRatio.toFixed(2)}:1); consider splitting the hierarchy.`)
  }

  const metrics = {
    ...dimensions,
    textElements: (svg.match(/<text\b/gi) ?? []).length,
    pathElements: (svg.match(/<path\b/gi) ?? []).length,
    edgeElements: (svg.match(/<(?:path|polyline|line)\b/gi) ?? []).length,
    rectElements: (svg.match(/<rect\b/gi) ?? []).length,
    groupElements: (svg.match(/<g\b/gi) ?? []).length,
    directedEdges: directedEdgeTags.length,
    arrowMarkerDefinitions: markerIds.size,
    arrowMarkerReferences: arrowMarkerReferences.length,
  }

  if (metrics.textElements > 60) warnings.push('Diagram contains more than 60 text elements; visual density may be excessive.')
  if (metrics.edgeElements > 250) warnings.push('Diagram contains more than 250 path/line elements; visual complexity may be excessive.')

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const file = args.find(arg => !arg.startsWith('--'))
  if (!file) {
    console.error('Usage: node inspect-svg.mjs <diagram.svg> [--json]')
    process.exitCode = 2
    return
  }

  const svg = await readFile(file, 'utf8')
  const result = inspectSvg(svg)
  console.log(json ? JSON.stringify(result, null, 2) : result.valid ? 'SVG checks passed.' : result.errors.join('\n'))
  if (!result.valid) process.exitCode = 1
}

async function isMainModule() {
  if (!process.argv[1]) return false
  try {
    return await realpath(process.argv[1]) === await realpath(new URL(import.meta.url))
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href
  }
}

if (await isMainModule()) {
  await main()
}

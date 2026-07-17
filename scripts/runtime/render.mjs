#!/usr/bin/env node

import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { renderMermaidSVG } from 'beautiful-mermaid'
import { Resvg } from '@resvg/resvg-js'
import { inspectSvg, parseSvgDimensions, sanitizeGeneratedSvg } from './inspect-svg.mjs'

const RENDERER_VERSION = '1.1.3'
const SUPPORTED_PREFIXES = [
  'graph',
  'flowchart',
  'stateDiagram-v2',
  'sequenceDiagram',
  'classDiagram',
  'erDiagram',
  'xychart-beta',
]

export function stripMermaidFrontmatter(code) {
  const withoutBom = code.replace(/^\uFEFF/, '')
  const leadingWhitespace = withoutBom.match(/^\s*/)?.[0] ?? ''
  const candidate = withoutBom.slice(leadingWhitespace.length)
  const lines = candidate.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return code
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (endIndex === -1) return code
  return lines.slice(endIndex + 1).join('\n').trimStart()
}

export function normalizeMermaidSource(code) {
  const lines = stripMermaidFrontmatter(code).split(/\r?\n/)
  while (lines.length > 0) {
    const first = lines[0]?.trim() ?? ''
    if (first.length === 0 || first.startsWith('%%')) {
      lines.shift()
      continue
    }
    break
  }
  return lines.join('\n').trimStart()
}

export function detectDiagramType(code) {
  const firstLine = normalizeMermaidSource(code).split(/\r?\n/)[0]?.trim() ?? ''
  return SUPPORTED_PREFIXES.find(prefix => firstLine.startsWith(prefix)) ?? null
}

function parseArgs(argv) {
  const result = {
    theme: 'craft-light',
    format: 'all',
    maxWidth: 1600,
    maxHeight: 1200,
    json: false,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      result.json = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      result.help = true
      continue
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (arg === '--input') result.input = value
    else if (arg === '--out-dir') result.outDir = value
    else if (arg === '--theme') result.theme = value
    else if (arg === '--format') result.format = value
    else if (arg === '--max-width') result.maxWidth = Number(value)
    else if (arg === '--max-height') result.maxHeight = Number(value)
    else throw new Error(`Unknown option: ${arg}`)
    i += 1
  }

  if (!result.help && !result.input) throw new Error('--input is required')
  if (!result.help && !result.outDir) throw new Error('--out-dir is required')
  if (!['craft-light', 'craft-dark'].includes(result.theme)) throw new Error(`Unknown theme: ${result.theme}`)
  if (!['svg', 'png', 'all'].includes(result.format)) throw new Error(`Unknown format: ${result.format}`)
  if (!Number.isFinite(result.maxWidth) || result.maxWidth <= 0) throw new Error('--max-width must be positive')
  if (!Number.isFinite(result.maxHeight) || result.maxHeight <= 0) throw new Error('--max-height must be positive')
  return result
}

async function loadTheme(name) {
  const runtimeDir = dirname(fileURLToPath(import.meta.url))
  const themePath = resolve(runtimeDir, '../../assets/themes', `${name}.json`)
  return JSON.parse(await readFile(themePath, 'utf8'))
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(normalized)) throw new Error(`Expected a six-digit hex color, received: ${hex}`)
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function mixHex(foreground, background, foregroundWeight) {
  const fg = hexToRgb(foreground)
  const bg = hexToRgb(background)
  const mix = channel => Math.round(fg[channel] * foregroundWeight + bg[channel] * (1 - foregroundWeight))
  return `#${['r', 'g', 'b'].map(channel => mix(channel).toString(16).padStart(2, '0')).join('')}`
}

function replaceCssVariables(input, colors) {
  let output = ''
  let cursor = 0

  while (cursor < input.length) {
    const start = input.indexOf('var(', cursor)
    if (start === -1) {
      output += input.slice(cursor)
      break
    }

    output += input.slice(cursor, start)
    let depth = 1
    let end = start + 4
    for (; end < input.length && depth > 0; end += 1) {
      if (input[end] === '(') depth += 1
      else if (input[end] === ')') depth -= 1
    }

    if (depth !== 0) {
      output += input.slice(start)
      break
    }

    const expression = input.slice(start + 4, end - 1)
    const variable = expression.split(',', 1)[0].trim()
    output += colors[variable] ?? input.slice(start, end)
    cursor = end
  }

  return output
}

function resolveColorMixes(input) {
  return input.replace(
    /color-mix\(in srgb,\s*(#[0-9a-f]{6})\s+([\d.]+)%\s*,\s*(#[0-9a-f]{6}|transparent)(?:\s+([\d.]+)%)?\s*\)/gi,
    (_, first, firstPercent, second, secondPercent) => {
      const firstWeight = Number(firstPercent)
      const secondWeight = secondPercent == null ? 100 - firstWeight : Number(secondPercent)
      const normalizedFirstWeight = firstWeight / (firstWeight + secondWeight)
      if (second.toLowerCase() === 'transparent') {
        const { r, g, b } = hexToRgb(first)
        return `rgba(${r}, ${g}, ${b}, ${normalizedFirstWeight.toFixed(3)})`
      }
      return mixHex(first, second, normalizedFirstWeight)
    },
  )
}

export function flattenSvgColors(svg, rendererOptions) {
  const { bg, fg, accent, line, muted, surface, border } = rendererOptions
  const colors = {
    '--bg': bg,
    '--fg': fg,
    '--accent': accent,
    '--line': line,
    '--muted': muted,
    '--surface': surface,
    '--border': border,
    '--_text': fg,
    '--_text-sec': muted,
    '--_text-muted': muted,
    '--_text-faint': mixHex(fg, bg, 0.25),
    '--_line': line,
    '--_arrow': accent,
    '--_node-fill': surface,
    '--_node-stroke': border,
    '--_group-fill': bg,
    '--_group-hdr': mixHex(fg, bg, 0.05),
    '--_inner-stroke': mixHex(fg, bg, 0.12),
    '--_key-badge': mixHex(fg, bg, 0.10),
    '--xychart-color-0': accent,
    '--xychart-bar-fill-0': mixHex(accent, bg, 0.25),
  }

  for (const match of svg.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})\s*;/gi)) {
    if (!(match[1] in colors)) colors[match[1]] = match[2]
  }
  for (const [variable, color] of Object.entries(colors)) {
    const seriesMatch = variable.match(/^--xychart-color-(\d+)$/)
    if (seriesMatch) colors[`--xychart-bar-fill-${seriesMatch[1]}`] = mixHex(color, bg, 0.25)
  }

  const flattened = resolveColorMixes(
    replaceCssVariables(
      svg.replace(/@import\s+url\([^;]+;?/gi, ''),
      colors,
    ),
  )

  if (/var\(|color-mix\(/i.test(flattened)) {
    throw new Error('Raster SVG still contains unresolved CSS variables or color-mix expressions.')
  }
  return flattened
}

const PORTABLE_ARROW_WIDTH = 12
const PORTABLE_ARROW_HEIGHT = 8

/**
 * Keep directed edges visible in SVG consumers that size markers differently.
 * The renderer's default 8x5 marker is easy to lose at preview scale, while
 * userSpaceOnUse keeps the arrowhead independent from the connector width.
 */
export function normalizeArrowMarkers(svg) {
  return svg.replace(
    /<marker\b([^>]*\bid=["'](?:arrowhead(?:-start)?(?:-[^"']+)?|seq-arrow(?:-open)?)["'][^>]*)>([\s\S]*?)<\/marker>/gi,
    (marker, attributes, content) => {
      const id = attributes.match(/\bid=["']([^"']+)["']/i)?.[1] ?? ''
      const isStart = id === 'arrowhead-start' || id.startsWith('arrowhead-start-')
      const isSequence = id === 'seq-arrow' || id === 'seq-arrow-open'
      const normalizedAttributes = attributes
        .replace(/\smarkerWidth=["'][^"']*["']/i, '')
        .replace(/\smarkerHeight=["'][^"']*["']/i, '')
        .replace(/\srefX=["'][^"']*["']/i, '')
        .replace(/\srefY=["'][^"']*["']/i, '')
        .replace(/\smarkerUnits=["'][^"']*["']/i, '')
        .replace(/\sviewBox=["'][^"']*["']/i, '')
        .replace(/\soverflow=["'][^"']*["']/i, '')
      const points = isStart
        ? `${PORTABLE_ARROW_WIDTH} 0, 0 ${PORTABLE_ARROW_HEIGHT / 2}, ${PORTABLE_ARROW_WIDTH} ${PORTABLE_ARROW_HEIGHT}`
        : `0 0, ${PORTABLE_ARROW_WIDTH} ${PORTABLE_ARROW_HEIGHT / 2}, 0 ${PORTABLE_ARROW_HEIGHT}`
      const normalizedContent = content.replace(/(<(?:polygon|polyline)\b[^>]*\bpoints=)["'][^"']*["']/i, `$1"${points}"`)

      const refX = isStart ? 1.5 : isSequence ? PORTABLE_ARROW_WIDTH : PORTABLE_ARROW_WIDTH - 1.5
      return `<marker${normalizedAttributes} markerWidth="${PORTABLE_ARROW_WIDTH}" markerHeight="${PORTABLE_ARROW_HEIGHT}" refX="${refX}" refY="${PORTABLE_ARROW_HEIGHT / 2}" markerUnits="userSpaceOnUse" viewBox="0 0 ${PORTABLE_ARROW_WIDTH} ${PORTABLE_ARROW_HEIGHT}" overflow="visible">${normalizedContent}</marker>`
    },
  )
}

function countPixelsNear(pixels, color, tolerance = 3) {
  const expected = hexToRgb(color)
  let count = 0
  for (let i = 0; i < pixels.length; i += 4) {
    if (
      Math.abs(pixels[i] - expected.r) <= tolerance
      && Math.abs(pixels[i + 1] - expected.g) <= tolerance
      && Math.abs(pixels[i + 2] - expected.b) <= tolerance
      && pixels[i + 3] > 0
    ) count += 1
  }
  return count
}

function rasterize(svg, theme, maxWidth, maxHeight) {
  const dimensions = parseSvgDimensions(svg)
  if (!dimensions) throw new Error('Cannot rasterize SVG without valid dimensions.')
  const scale = Math.min(maxWidth / dimensions.width, maxHeight / dimensions.height, 2)
  const rasterSvg = flattenSvgColors(svg, theme.rendererOptions)
  const resvg = new Resvg(rasterSvg, {
    background: theme.previewBackground,
    fitTo: { mode: 'zoom', value: Math.max(scale, 0.1) },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'Arial',
    },
  })
  const rendered = resvg.render()
  const pixels = rendered.pixels
  const foregroundPixels = countPixelsNear(pixels, theme.rendererOptions.fg)
  const mutedPixels = countPixelsNear(pixels, theme.rendererOptions.muted)
  const linePixels = countPixelsNear(pixels, theme.rendererOptions.line)
  const accentPixels = countPixelsNear(pixels, theme.rendererOptions.accent)
  return {
    png: rendered.asPng(),
    metrics: {
      width: rendered.width,
      height: rendered.height,
      foregroundPixels,
      mutedPixels,
      linePixels,
      accentPixels,
      readablePixels: foregroundPixels + mutedPixels + linePixels + accentPixels,
    },
  }
}

export async function renderDiagram(options) {
  const inputPath = resolve(options.input)
  const outDir = resolve(options.outDir)
  const original = await readFile(inputPath, 'utf8')
  const normalized = normalizeMermaidSource(original)
  const diagramType = detectDiagramType(normalized)
  const base = basename(inputPath, extname(inputPath))
  const defaultSourcePath = join(outDir, `${base}.mmd`)
  const paths = {
    source: resolve(defaultSourcePath) === inputPath ? join(outDir, `${base}.normalized.mmd`) : defaultSourcePath,
    svg: join(outDir, `${base}.svg`),
    png: join(outDir, `${base}.png`),
    report: join(outDir, `${base}.report.json`),
  }

  await mkdir(outDir, { recursive: true })

  const report = {
    valid: false,
    renderer: 'beautiful-mermaid',
    rendererVersion: RENDERER_VERSION,
    theme: options.theme,
    diagramType,
    artifacts: {},
    errors: [],
    warnings: [],
    visualReview: { status: 'pending' },
  }

  try {
    if (!diagramType) {
      throw new Error(`Unsupported diagram type in Craft-compatible mode. Expected one of: ${SUPPORTED_PREFIXES.join(', ')}`)
    }

    const theme = await loadTheme(options.theme)
    const rawSvg = renderMermaidSVG(normalized, theme.rendererOptions)
    const sanitizedSvg = sanitizeGeneratedSvg(rawSvg)
    if (sanitizedSvg !== rawSvg) report.warnings.push('Potentially unsafe SVG content was removed from the rendered output.')
    const svg = flattenSvgColors(normalizeArrowMarkers(sanitizedSvg), theme.rendererOptions)
    const inspection = inspectSvg(svg)
    report.errors.push(...inspection.errors)
    report.warnings.push(...inspection.warnings)
    report.metrics = inspection.metrics
    if (!inspection.valid) throw new Error(inspection.errors.join(' '))

    await writeFile(paths.source, normalized.endsWith('\n') ? normalized : `${normalized}\n`, 'utf8')
    report.artifacts.source = paths.source

    if (options.format === 'svg' || options.format === 'all') {
      await writeFile(paths.svg, svg, 'utf8')
      report.artifacts.svg = paths.svg
    }

    if (options.format === 'png' || options.format === 'all') {
      const raster = rasterize(svg, theme, options.maxWidth, options.maxHeight)
      await writeFile(paths.png, raster.png)
      report.artifacts.png = paths.png
      report.raster = raster.metrics
      if (raster.metrics.readablePixels === 0) {
        throw new Error('Rasterized preview contains no readable palette-colored pixels.')
      }
      if (raster.metrics.accentPixels === 0) {
        report.warnings.push('Rasterized preview contains no accent-colored pixels; verify arrow visibility.')
      }
    }

    report.valid = true
  } catch (error) {
    report.errors.push(error instanceof Error ? error.message : String(error))
  }

  report.artifacts.report = paths.report
  await writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    console.error('Usage: node render.mjs --input <file.mmd> --out-dir <dir> [--theme craft-light|craft-dark] [--format svg|png|all] [--max-width 1600] [--max-height 1200] [--json]')
    process.exitCode = 2
    return
  }

  if (options.help) {
    console.log('Usage: node render.mjs --input <file.mmd> --out-dir <dir> [--theme craft-light|craft-dark] [--format svg|png|all] [--max-width 1600] [--max-height 1200] [--json]')
    return
  }

  const report = await renderDiagram(options)
  console.log(options.json ? JSON.stringify(report, null, 2) : report.valid ? `Rendered ${report.artifacts.svg ?? report.artifacts.png}` : report.errors.join('\n'))
  if (!report.valid) process.exitCode = 1
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

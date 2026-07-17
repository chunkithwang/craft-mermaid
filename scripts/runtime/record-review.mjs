#!/usr/bin/env node

import { readFile, realpath, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const VALID_STATUSES = new Set(['passed', 'failed', 'skipped'])
const SCORE_KEYS = ['semanticCoverage', 'legibility', 'layout', 'grouping', 'density']

function validateReview(review) {
  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    throw new Error('Visual review must be a JSON object.')
  }
  if (!VALID_STATUSES.has(review.status)) {
    throw new Error('Visual review status must be passed, failed, or skipped.')
  }
  if (review.status === 'skipped') {
    if (typeof review.reason !== 'string' || review.reason.trim() === '') {
      throw new Error('A skipped visual review requires a non-empty reason.')
    }
    return
  }
  if (!Number.isInteger(review.round) || review.round < 1 || review.round > 2) {
    throw new Error('Visual review round must be 1 or 2.')
  }
  for (const key of SCORE_KEYS) {
    const score = review.scores?.[key]
    if (!Number.isFinite(score) || score < 1 || score > 5) {
      throw new Error(`Visual review score ${key} must be between 1 and 5.`)
    }
  }
  if (!Array.isArray(review.issues)) throw new Error('Visual review issues must be an array.')
  if (review.status === 'passed' && review.issues.length > 0) {
    throw new Error('A passed visual review cannot contain unresolved issues.')
  }
}

export async function recordReview(reportPath, reviewPath) {
  const report = JSON.parse(await readFile(reportPath, 'utf8'))
  const review = JSON.parse(await readFile(reviewPath, 'utf8'))
  if (report.valid !== true) throw new Error('Cannot attach visual review to an invalid render report.')
  validateReview(review)
  report.visualReview = review
  report.artifacts = { ...report.artifacts, visualReview: reviewPath }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  return report
}

function parseArgs(argv) {
  const options = { json: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--json') {
      options.json = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    const value = argv[i + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`)
    if (arg === '--report') options.report = value
    else if (arg === '--review') options.review = value
    else throw new Error(`Unknown option: ${arg}`)
    i += 1
  }
  if (!options.help && !options.report) throw new Error('--report is required')
  if (!options.help && !options.review) throw new Error('--review is required')
  return options
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
    return
  }
  if (options.help) {
    console.log('Usage: node record-review.mjs --report <diagram.report.json> --review <diagram.visual-review.json> [--json]')
    return
  }
  try {
    const report = await recordReview(options.report, options.review)
    console.log(options.json ? JSON.stringify(report, null, 2) : `Recorded visual review: ${report.visualReview.status}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
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

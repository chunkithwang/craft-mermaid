#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const MINIMUM_NODE_MAJOR = 20
const runtimeDir = fileURLToPath(new URL('./runtime/', import.meta.url))

function assertSupportedNode(version = process.versions.node) {
  const major = Number.parseInt(version.split('.')[0], 10)
  if (!Number.isInteger(major) || major < MINIMUM_NODE_MAJOR) {
    throw new Error(`Craft Mermaid requires Node.js ${MINIMUM_NODE_MAJOR} or newer; found ${version}.`)
  }
}

async function assertRuntimeManifest() {
  try {
    await Promise.all([
      access(new URL('./runtime/package.json', import.meta.url)),
      access(new URL('./runtime/package-lock.json', import.meta.url)),
    ])
  } catch {
    throw new Error(`Craft Mermaid runtime manifests are missing from ${runtimeDir}. Reinstall the skill and try again.`)
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: false,
    })

    child.once('error', error => {
      reject(new Error(`Could not start ${command}: ${error.message}`))
    })
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      const reason = signal ? `signal ${signal}` : `exit code ${code}`
      reject(new Error(`${command} ${args.join(' ')} failed with ${reason}.`))
    })
  })
}

async function setupRuntime({ npmCommand } = {}) {
  assertSupportedNode()
  await assertRuntimeManifest()

  const npm = npmCommand ?? (process.platform === 'win32' ? 'npm.cmd' : 'npm')
  console.log(`Installing Craft Mermaid runtime dependencies in ${runtimeDir}`)
  await run(npm, ['ci', '--prefix', runtimeDir, '--ignore-scripts', '--no-audit', '--no-fund'])

  console.log('Verifying Craft Mermaid runtime')
  await run(npm, ['test', '--prefix', runtimeDir])
  console.log('Craft Mermaid runtime is ready.')
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node <craft-mermaid-dir>/scripts/setup-runtime.mjs')
    console.log('Installs pinned runtime dependencies and runs the smoke test.')
    return
  }
  if (process.argv.length > 2) {
    console.error(`Unknown option: ${process.argv[2]}`)
    process.exitCode = 2
    return
  }

  try {
    await setupRuntime()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

await main()

export default {
  apply(ctx) {
    const tools = ctx.get('tools')
    const shell = ctx.get('shell')
    const skills = ctx.get('skills')
    if (tools === undefined || shell === undefined) return

    const NODE_PROBE = 'NODE_BIN=$(command -v node || command -v /opt/homebrew/bin/node || command -v /usr/local/bin/node || command -v /usr/bin/node || command -v /usr/local/opt/node/bin/node); if [ -z "$NODE_BIN" ]; then echo "craft-mermaid: node runtime not found (need Node.js >= 20)"; exit 127; fi'

    async function skillDirOf(override) {
      if (override !== undefined && override !== '') return String(override)
      if (skills !== undefined) {
        try {
          const skill = await skills.get('craft-mermaid', {})
          if (skill !== undefined && skill.resourceBase !== undefined && typeof skill.resourceBase.path === 'string') {
            return skill.resourceBase.path
          }
        } catch (_) {
          // registry miss falls through to the undefined return
        }
      }
      return undefined
    }

    function quote(value) {
      return JSON.stringify(String(value))
    }

    function agentCwdOf(exec) {
      if (exec.agent !== undefined && exec.agent.session !== undefined && exec.agent.session.header !== undefined && typeof exec.agent.session.header.cwd === 'string') {
        return exec.agent.session.header.cwd
      }
      return undefined
    }

    function agentIdOf(exec) {
      if (exec.agent !== undefined && typeof exec.agent.id === 'string') return exec.agent.id
      return undefined
    }

    function resolvePath(value, base) {
      const text = String(value)
      if (base === undefined || base === '' || text.startsWith('/')) return text
      return base.replace(/\/+$/, '') + '/' + text
    }

    async function runNode(scriptArgs, timeoutMs, signal, exec) {
      const cwd = agentCwdOf(exec)
      const command = NODE_PROBE + '; "$NODE_BIN" ' + scriptArgs.map(quote).join(' ')
      const request = { command, timeoutMs, stdoutMaxBytes: 262144, signal }
      if (cwd !== undefined) {
        request.workdir = cwd
        const sandboxPolicy = { mode: 'workspace-write', workspaceRoot: cwd }
        const sessionId = agentIdOf(exec)
        if (sessionId !== undefined) sandboxPolicy.sessionId = sessionId
        request.sandboxPolicy = sandboxPolicy
      }
      const spec = shell.resolve(request)
      return shell.run(spec)
    }

    function tailOf(output) {
      if (output === undefined) return { text: '', truncated: false }
      const tail = { text: output.text, truncated: output.truncated === true }
      if (output.spillPath !== undefined) tail.spillPath = output.spillPath
      return tail
    }

    function outcomeShape(result) {
      return {
        exitCode: result.exitCode,
        signal: result.signal,
        timedOut: result.timedOut === true,
        aborted: result.aborted === true,
        sandboxDenied: result.sandbox !== undefined && result.sandbox.denied === true,
        stdoutTail: tailOf(result.stdout),
        stderrTail: tailOf(result.stderr),
      }
    }

    const renderTool = harness.defineTool({
      name: 'craft_mermaid_render',
      description: 'Render a Mermaid .mmd source file to a deterministic high-resolution PNG with the Craft Mermaid runtime (pinned beautiful-mermaid engine, craft-light/craft-dark palettes). Write the .mmd file with the write tool first. Returns the renderer JSON validation result (valid, errors, metrics, raster stats) and absolute artifact paths; failures return the exact diagnostic for repair. After success, inspect the PNG with read_image and apply the craft-mermaid skill visual-review checklist before delivering. Relative paths resolve against the session workspace; prefer craft-light unless dark output was requested.',
      parameters: {
        input: { type: 'string', required: true, description: 'Path to the Mermaid source file (.mmd); relative paths resolve against the session workspace.' },
        outDir: { type: 'string', required: true, description: 'Artifact directory inside the session workspace; receives the PNG and normalized source.' },
        theme: { type: 'string', enum: ['craft-light', 'craft-dark'], description: 'Palette; defaults to craft-light.' },
        scale: { type: 'integer', description: 'Pixel density factor; default 3.' },
        maxWidth: { type: 'integer', description: 'Maximum raster width in pixels; default 4096.' },
        maxHeight: { type: 'integer', description: 'Maximum raster height in pixels; default 3072.' },
        skillDir: { type: 'string', description: 'Optional override for the skill directory; defaults to the installed craft-mermaid skill found through the skill registry.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const skillDir = await skillDirOf(args.skillDir)
        if (skillDir === undefined) {
          return { ok: false, hint: 'The craft-mermaid skill was not found in the skill registry. Install the skill bundle (dsh plugin add) or pass skillDir explicitly, and make sure its scripts/runtime dependencies are set up.' }
        }
        const cwd = agentCwdOf(exec)
        const argv = [resolvePath(skillDir, cwd) + '/scripts/runtime/render.mjs',
          '--input', resolvePath(args.input, cwd),
          '--out-dir', resolvePath(args.outDir, cwd),
          '--json']
        if (args.theme !== undefined) argv.push('--theme', args.theme)
        if (args.scale !== undefined) argv.push('--scale', String(args.scale))
        if (args.maxWidth !== undefined) argv.push('--max-width', String(args.maxWidth))
        if (args.maxHeight !== undefined) argv.push('--max-height', String(args.maxHeight))
        const result = await runNode(argv, 120000, exec.signal, exec)
        const shape = outcomeShape(result)
        let render = null
        try {
          render = JSON.parse(result.stdout.text)
        } catch (_) {
          render = null
        }
        if (shape.sandboxDenied) {
          return { ok: false, hint: 'The file sandbox denied the renderer file access. Keep input and outDir inside the session workspace, or request wider sandbox permissions.', ...shape, render }
        }
        if (render === null) {
          return { ok: false, hint: 'The renderer did not emit a JSON validation result. Check stderrTail: a missing runtime means run craft_mermaid_setup; an ENOENT path means the input or outDir could not be resolved.', ...shape }
        }
        return { ok: result.exitCode === 0 && render.valid === true, ...shape, render }
      },
    })
    harness.registerTool(ctx, renderTool)

    const setupTool = harness.defineTool({
      name: 'craft_mermaid_setup',
      description: 'Install or repair the Craft Mermaid runtime dependencies: checks Node.js >= 20, runs pinned npm ci against the bundled lockfile, and runs the render smoke test (6 diagram types). Use when craft_mermaid_render reports missing or broken dependencies or after the skill files were updated. May need network access and writes to the skill directory outside the session workspace; if the sandbox denies it, retry through the bash tool with sandbox_permissions plus a justification so the user can approve it.',
      parameters: {
        skillDir: { type: 'string', description: 'Optional override for the skill directory; defaults to the installed craft-mermaid skill found through the skill registry.' },
      },
      output: {
        schema: { type: 'json' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
      },
      async execute(args, exec) {
        const skillDir = await skillDirOf(args.skillDir)
        if (skillDir === undefined) {
          return { ok: false, hint: 'The craft-mermaid skill was not found in the skill registry. Install the skill bundle (dsh plugin add) or pass skillDir explicitly.' }
        }
        const cwd = agentCwdOf(exec)
        const argv = [resolvePath(skillDir, cwd) + '/scripts/setup-runtime.mjs']
        const result = await runNode(argv, 300000, exec.signal, exec)
        const shape = outcomeShape(result)
        if (shape.sandboxDenied) {
          return { ok: false, hint: 'The file sandbox denied writes to the skill directory. Run the setup through the bash tool with sandbox_permissions plus a justification so the user can approve it.', ...shape }
        }
        return { ok: result.exitCode === 0, ...shape }
      },
    })
    harness.registerTool(ctx, setupTool)
  },
}

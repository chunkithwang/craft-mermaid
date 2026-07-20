# Craft Mermaid Skill

![Skill](https://img.shields.io/badge/Skill-Agent-111111?style=flat-square)
![Claude Code](https://img.shields.io/badge/Claude%20Code-Supported-6B5B95?style=flat-square)
![Codex](https://img.shields.io/badge/Codex-Supported-222222?style=flat-square)
![Node](https://img.shields.io/badge/Node-%3E%3D20-339933?style=flat-square)
![License](https://img.shields.io/badge/License-Apache--2.0-blue?style=flat-square)

一个面向 Codex、Claude Code 和其他本地 Agent 的 Mermaid Skill。它把
[Craft Agents](https://github.com/craft-ai-agents/craft-agents-oss) 的图表选择、
生成、渲染和视觉复检流程封装成可移植 Skill，并使用相同的
`beautiful-mermaid` 渲染器系列与匹配的明暗主题。

这个项目交付规范化 `.mmd` 源码和高分辨率 `.png` 文件，而不是依赖宿主对
Mermaid 代码块的默认预览。这样在不同 Agent 中使用时，图表外观更稳定。

## 30 秒开始

```bash
npx skills add https://github.com/chunkithwang/craft-mermaid --skill craft-mermaid
```

安装 Skill 后，让同一个安装 Agent 继续在实际安装目录初始化并验证渲染运行时：

```bash
CRAFT_MERMAID_DIR="/absolute/path/to/craft-mermaid"
node "$CRAFT_MERMAID_DIR/scripts/setup-runtime.mjs"
```

常见安装位置包括项目内的 `.agents/skills/craft-mermaid`、用户级的
`~/.agents/skills/craft-mermaid`、`~/.codex/skills/craft-mermaid` 或
`~/.claude/skills/craft-mermaid`。以安装器实际返回的路径为准。
初始化脚本会执行锁定版本的 `npm ci` 和 `npm test`；因为这一步可能访问网络
并修改 Skill 目录，安装 Agent 应先请求授权，但不应把它拆成另一项安装任务。

安装后直接对 Agent 说：

```text
用 Craft Mermaid 把这套支付流程画成一张高清流程图，并做视觉复检。
```

也可以试这些请求：

```text
把这份系统设计整理成 Craft 风格的架构图。
用时序图说明 OAuth 登录流程，使用深色主题。
把这段 Mermaid 渲染成高清 PNG，检查是否有文字裁切或节点重叠。
```

## 安装

### 方式一：Skills CLI 安装（推荐）

```bash
npx skills add https://github.com/chunkithwang/craft-mermaid --skill craft-mermaid
```

安装器完成后，让安装 Agent 使用它报告的 Skill 目录完成依赖安装与验证：

```bash
CRAFT_MERMAID_DIR="/absolute/path/to/installed/craft-mermaid"
node "$CRAFT_MERMAID_DIR/scripts/setup-runtime.mjs"
```

`setup-runtime.mjs` 不应省略。Skills CLI 只安装 Skill 文件，不会执行项目脚本；
这个初始化入口会检查 Node.js 版本、执行 `npm ci`，再运行 smoke test。Skill
的决策流程可以在没有依赖时被 Agent 读取，但 PNG 渲染、确定性检查和
视觉复检链路将无法完整执行。

### 方式二：把下面这段话直接发给 AI

> 帮我安装 `craft-mermaid` Skill。请按下面步骤执行：
>
> 1. 确认本机已安装 Node.js 20 或更高版本。
> 2. 执行
>    `npx skills add https://github.com/chunkithwang/craft-mermaid --skill craft-mermaid`。
> 3. 不要在 `skills add` 完成后停止。找到安装器返回的实际 `craft-mermaid`
>    目录；依赖安装可能访问网络并修改该目录，因此先向我请求授权。
> 4. 获得授权后，运行
>    `node <实际安装目录>/scripts/setup-runtime.mjs`。它会依次执行锁定依赖的
>    `npm ci` 和 `npm test`，任一步失败都视为安装未完成。
> 5. 检查 `SKILL.md`、`assets/`、`references/` 和 `scripts/runtime/` 是否存在，
>    并告诉我实际安装路径和测试结果。

把这段话发给 Codex、Claude Code、Cursor 或其他有文件系统和 shell 权限的
Agent，它可以完成安装和验证。

### 方式三：手动命令行

Codex：

```bash
git clone https://github.com/chunkithwang/craft-mermaid.git ~/.codex/skills/craft-mermaid
node ~/.codex/skills/craft-mermaid/scripts/setup-runtime.mjs
```

Claude Code：

```bash
git clone https://github.com/chunkithwang/craft-mermaid.git ~/.claude/skills/craft-mermaid
node ~/.claude/skills/craft-mermaid/scripts/setup-runtime.mjs
```

其他支持 Agent Skills 的工具，请把完整仓库克隆到该工具约定的 Skill
目录，再执行同一个 `scripts/setup-runtime.mjs` 初始化入口。

### Skills CLI 更新

明确指定要更新项目级还是全局 Skill：

```bash
# 项目级
npx skills update craft-mermaid --project

# 全局
npx skills update craft-mermaid --global
```

如果 Skills CLI 报告 Craft Mermaid 已更新，它会替换 Skill 目录，原来的
`scripts/runtime/node_modules` 不会被恢复。更新 Agent 必须继续定位实际安装
目录，并在获得依赖安装授权后运行：

```bash
CRAFT_MERMAID_DIR="/absolute/path/to/installed/craft-mermaid"
node "$CRAFT_MERMAID_DIR/scripts/setup-runtime.mjs"
```

如果 Skills CLI 报告已经是最新版，则不要重复安装依赖。

也可以把下面这段话直接发给 AI：

> 帮我更新 `craft-mermaid` Skill。请先确认它是项目级还是全局安装，再使用
> 对应的 `npx skills update craft-mermaid --project` 或 `--global`。不要在文件
> 更新后停止：如果 Skills CLI 确认 Craft Mermaid 已更新，找到更新后的实际
> Skill 目录，先向我请求依赖安装授权，再运行
> `node <实际安装目录>/scripts/setup-runtime.mjs`，并报告更新路径和测试结果。
> 如果它已经是最新版，不要重复执行依赖安装。

### 手动 Git 更新

```bash
CRAFT_MERMAID_DIR="/absolute/path/to/installed/craft-mermaid"
git -C "$CRAFT_MERMAID_DIR" pull
node "$CRAFT_MERMAID_DIR/scripts/setup-runtime.mjs"
```

在 Git 实际拉取到新提交后重新执行初始化入口，使本地运行时与仓库中的
`package-lock.json` 保持一致，并立即验证渲染链路。

## 为什么不只输出 Mermaid 代码块

不同编辑器和聊天客户端可能使用不同 Mermaid 版本、主题和布局参数。相同
源码在宿主预览中不一定拥有相同外观。

Craft Mermaid 会：

1. 根据内容选择兼容的图表类型和方向。
2. 用固定版本的 `beautiful-mermaid` 和 Craft 明暗主题渲染。
3. 生成规范化 Mermaid 源码和高分辨率 PNG。
4. 在内存中对 SVG 中间结果做确定性检查，不写入 SVG 文件。
5. 在宿主支持查看图片时复检 PNG，并最多自动修复两轮。

因此，可移植的视觉结果是生成的 PNG，而不是聊天界面重新渲染的代码块。

## 支持的图表

| 图表 | Mermaid 语法 | 适合场景 |
|---|---|---|
| 流程图 / 架构图 | `graph`、`flowchart` | 工作流、系统关系、决策路径 |
| 状态图 | `stateDiagram-v2` | 生命周期、状态迁移 |
| 时序图 | `sequenceDiagram` | API、认证、服务调用 |
| 类图 | `classDiagram` | 类型和继承关系 |
| ER 图 | `erDiagram` | 数据模型和实体关系 |
| XY 图 | `xychart-beta` | 简单趋势、柱线对比 |

为了保持 Craft 兼容模式的渲染效果，当前不会静默切换到 Mermaid CLI、Kroki
或其他渲染器。遇到不支持的图表类型时，Skill 会说明限制，而不是输出一个
外观不同但未标注的结果。

## 直接使用渲染器

除了让 Agent 自动调用，也可以直接运行：

```bash
node /absolute/path/to/craft-mermaid/scripts/runtime/render.mjs \
  --input diagram.mmd \
  --out-dir output \
  --theme craft-light \
  --json
```

可用参数：

```text
--input <path>             Mermaid 源文件，必填
--out-dir <path>           输出目录，必填
--theme craft-light|craft-dark
--scale <factor>           默认 3
--max-width <pixels>       默认 4096
--max-height <pixels>      默认 3072
--json                     向标准输出打印机器可读校验结果
```

典型输出：

```text
diagram.mmd
diagram.png
```

输入和输出位于同一目录时，规范化源码会写为
`diagram.normalized.mmd`，不会覆盖原文件。

## 视觉复检

Skill 会先在内存中检查 SVG 中间结果的尺寸、危险内容和异常复杂度，再在宿主
有图片查看能力时检查 PNG 的文字裁切、节点重叠、边线交叉、可读性、分组和
留白。校验结果不会额外写成报告文件。

视觉复检有明确边界：

- 宿主能查看图片时，Agent 才能将结果标记为 `passed` 或 `failed`。
- 宿主不能查看图片时，只能记录为 `skipped`，不能把源码检查冒充视觉通过。
- 自动调整最多两轮，之后会保留产物并报告未解决问题。

评分和复检数据格式见
[`references/visual-review.md`](./references/visual-review.md)。

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Codex | 支持 | 可生成文件、运行渲染器并查看 PNG |
| Claude Code | 支持 | 可生成文件和运行渲染器；视觉复检取决于宿主图片能力 |
| Cursor / 其他本地 Agent | 可用 | 需要支持 Agent Skills、文件读写和 shell 命令 |
| 普通 Chatbot | 不推荐 | 缺少文件系统或命令执行时只能生成源码，无法保证渲染结果 |

## 环境与一致性说明

- 需要 Node.js 20 或更高版本。
- 运行时固定使用 `beautiful-mermaid@1.1.3` 和
  `@resvg/resvg-js@2.6.2`。
- 提供 `craft-light` 和 `craft-dark` 两套主题。
- 内存中的 SVG 会把主题色解析为具体颜色、清理折线端点的亚像素残段，并使用
  固定尺寸的箭头 marker，避免方向偏转；它只参与校验和 PNG 光栅化，不会落盘。
- PNG 默认按 3 倍像素密度渲染，上限为 4096×3072；可通过 `--scale` 和最大
  尺寸参数调整。渲染时使用系统字体回退，不同系统的文字度量可能轻微不同。
- 自定义 `style` 或 `classDef` 会覆盖便携主题，除非用户明确要求，否则 Skill
  会避免使用。

## 目录结构

```text
craft-mermaid/
├── SKILL.md
├── agents/
│   └── openai.yaml
├── assets/
│   └── themes/
│       ├── craft-light.json
│       └── craft-dark.json
├── references/
│   ├── syntax.md
│   └── visual-review.md
└── scripts/
    ├── setup-runtime.mjs
    └── runtime/
        ├── render.mjs
        ├── inspect-svg.mjs
        ├── smoke-test.mjs
        ├── package.json
        └── package-lock.json
```

## 来源与许可证

本项目包含从
[Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss)
适配的工作流指导、Mermaid 语法文档、源码规范化逻辑、渲染器配置和默认主题值。
详细归属见 [`NOTICE`](./NOTICE)。

项目采用 [Apache License 2.0](./LICENSE)。运行时依赖遵循各自的软件许可证。

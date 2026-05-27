# Live Captions to Obsidian — 重构计划

> 生成日期：2026-05-27
> 由 5 个子代理（架构、代码质量、安全、开发体验、CI/CD）并行分析汇编

---

## 目录

1. [架构与设计重构](#1-架构与设计重构)
2. [代码质量与测试](#2-代码质量与测试)
3. [PowerShell 脚本安全与健壮性](#3-powershell-脚本安全与健壮性)
4. [开发体验与配置系统](#4-开发体验与配置系统)
5. [CI/CD 与 GitHub 集成](#5-cicd-与-github-集成)
6. [优先级路线图](#6-优先级路线图)

---

## 1. 架构与设计重构

### 1.1 当前架构评估

| 模块 | 文件 | 职责 | 问题 |
|------|------|------|------|
| Entry | `src/index.ts` | CLI 解析、编排、状态管理、console.log | 职责过多，状态散落 |
| Config | `src/config.ts` | Config 接口、默认值 | 违反接口隔离原则 |
| WindowMonitor | `src/monitor.ts` | 轮询窗口存在性 | 与 CaptureService 大量重复代码 |
| CaptureService | `src/capture.ts` | 字幕文本提取、去重 | 去重逻辑是私有方法不可测 |
| ObsidianWriter | `src/writer.ts` | Markdown 文件写入 | 同步 I/O 阻塞事件循环 |
| PS1 脚本 | `src/scripts/uia-capture.ps1` | 全部 PowerShell UIA 逻辑 | 单文件承载双职责 |

### 1.2 关键问题

1. **EventEmitter 类型不安全** — `emit("text", lines)` 无编译期检查事件名和参数类型
2. **PS1 单文件双职责** — `Invoke-Watch` 和 `Invoke-Capture` 在同一个文件中
3. **进程生命周期管理重复** — `monitor.ts` 和 `capture.ts` 各有完全相同的 spawn/stdin/stderr/stop 模式
4. **模块间紧耦合** — `index.ts` 直接 `new` 所有服务，无法单独测试编排逻辑
5. **Config 违反接口隔离** — 每个模块接收完整 `Config` 但实际只用其中几个字段
6. **双重 gone 事件** — PS1 主动发 `gone` + `close` 事件再发一次，可能导致重复
7. **`extractNewLines` 不可测试** — 纯函数逻辑但作为私有方法

### 1.3 重构方案

#### 1.3.1 类型安全事件系统

创建 `src/lib/typed-event-emitter.ts`，使用泛型约束 `emit`/`on` 的事件名和参数类型：

```typescript
type EventMap = Record<string, any[]>;

class TypedEventEmitter<Events extends EventMap> {
  on<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void;
  emit<K extends keyof Events>(event: K, ...args: Events[K]): void;
  off<K extends keyof Events>(event: K, listener: (...args: Events[K]) => void): void;
}
```

#### 1.3.2 抽取 PsProcess 类

创建 `src/lib/ps-process.ts`，封装 PowerShell 子进程的完整生命周期：

- `start()` — spawn + pipe setup
- `sendCommand()` — stdin JSON 写入
- `stop()` — 优雅关闭（send exit → wait → kill）
- 自动 JSON 行解析、stderr drain、健康检查

消除 `monitor.ts`/`capture.ts` 中重复的进程管理代码。

#### 1.3.3 服务接口与编排层

定义 `IWindowMonitor` / `ICaptureService` / `IWriter` 接口，创建 `CaptureOrchestrator` 承担编排职责：

```
index.ts → parse CLI → create services → CaptureOrchestrator.start()
CaptureOrchestrator 管理: isCapturing, lineCount, 事件编排
```

#### 1.3.4 提取去重为纯函数

`src/lib/dedup.ts` — `extractNewLines(rawLines, prevText)` 纯函数，独立可测。

#### 1.3.5 按接口隔离 Config

```typescript
interface WatchConfig { windowTitle: string; watchInterval: number; }
interface CaptureConfig { windowTitle: string; captureInterval: number; }
interface WriterConfig { vaultPath: string; notesDir: string; }
```

### 1.4 重构后架构

```
index.ts (CLI → 工厂 → orchestrator.start())
    │
    ▼
CaptureOrchestrator
    ├── WindowMonitor (→ PsProcess → watch-window.ps1)
    ├── CaptureService (→ PsProcess → read-captions.ps1)
    ├── ObsidianWriter (→ Markdown 文件)
    └── ILogger (注入)
```

---

## 2. 代码质量与测试

### 2.1 当前代码质量问题

| 严重性 | 问题 | 文件位置 |
|--------|------|----------|
| P0 | 零测试覆盖 | 全项目 |
| P0 | 空 catch 静默吞异常 | `monitor.ts:65`, `capture.ts:92,105` |
| P0 | 无 uncaughtException/unhandledRejection 处理 | `index.ts` |
| P1 | monitor + capture 重复 spawn 逻辑 | 两文件共 5 处重复模式 |
| P1 | 日志无法按级别过滤 | 全项目 `console.log` |
| P1 | CLI 参数解析无校验 | `index.ts:13-22` |
| P2 | 同步文件 I/O 阻塞事件循环 | `writer.ts` |
| P2 | EventEmitter emit 无类型约束 | `monitor.ts`, `capture.ts` |
| P3 | 500ms kill 超时 magic number | `capture.ts:104`, `monitor.ts:83` |

### 2.2 测试基础设施

**框架选择：Vitest**（ESM 原生支持，无需 Vite 配置，自动读取 tsconfig）

```bash
npm install -D vitest
```

**测试目录结构：**

```
src/
├── __tests__/
│   ├── config.test.ts        # 配置解析与合并
│   ├── capture.test.ts       # extractNewLines 单元测试
│   └── writer.test.ts        # 日期格式化、writeLines
test/
├── integration/
│   ├── powershell-spawn.test.ts
│   └── obsidian-writer.test.ts
├── e2e/
│   └── full-pipeline.test.ts
└── fixtures/
    └── mock-ps1-output.jsonl
```

**Mock 策略：** `vi.mock("child_process")` / `vi.mock("fs")` / 伪造 PS1 stdout 流

### 2.3 `extractNewLines` 测试用例（优先级最高）

| 场景 | 输入 | 预期 |
|------|------|------|
| 正常追加 | prevText="A\nB", lines=["A","B","C"] | ["C"] |
| 完全重写 | prevText="旧", lines=["新"] | ["新"] |
| 部分重写 | prevText="开始；旧", lines=["开始；新"] | ["新"] |
| 空输入 | prevText="有", lines=[] | [] |
| 无新内容 | prevText="相同", lines=["相同"] | [] |

### 2.4 代码质量工具链

**ESLint 规则重点：**
- `no-console: "warn"` — 提醒 `console.log`，`console.error` 可例外
- `no-empty: ["error", { allowEmptyCatch: false }]` — 禁止空 catch
- `max-depth: ["warn", 4]` — 禁止 >4 层嵌套
- `max-lines: ["warn", { max: 300 }]` — 每文件 <= 300 行

**TypeScript 增强：**
- `"noUncheckedIndexedAccess": true` — 防止数组越界
- `"noImplicitOverride": true` — 强制 override 关键字

---

## 3. PowerShell 脚本安全与健壮性

### 3.1 安全风险等级

| 风险 | 等级 | 紧急程度 |
|------|------|----------|
| `LoadWithPartialName` 弃用 | 中 | 近期 |
| 手动 JSON 转义缺失控制字符 | **高** | **立即** |
| PS1 崩溃时 Node 侧误导性 "gone" 事件 | 中 | 中 |
| `keybd_event` 键状态不同步 | **高** | **立即** |
| 无进程健康监控 | 中 | 短期 |
| stdin 轮询中 `.Result` 潜在死锁 | 低 | 低 |

### 3.2 关键修复

#### 3.2.1 替换弃用的 UIA 程序集加载

```powershell
# 当前（弃用）
[System.Reflection.Assembly]::LoadWithPartialName('UIAutomationClient')

# 修复
Add-Type -AssemblyName 'UIAutomationClient'
Add-Type -AssemblyName 'UIAutomationTypes'
```

#### 3.2.2 使用 ConvertTo-Json 替代手动转义

```powershell
# 当前（脆弱）
$escapedLines = $lines | ForEach-Object {
    '"' + ($_ -replace '\\', '\\\\' -replace '"', '\"' ...) + '"'
}

# 修复
$jsonObject = @{ type = "text"; lines = @($lines) }
Send-Json ($jsonObject | ConvertTo-Json -Compress)
```

`ConvertTo-Json` 正确处理所有控制字符、Unicode 代理对、嵌套引号。

#### 3.2.3 修复 keybd_event → SendInput

```powershell
# 或更好的方案：绕过键盘模拟直接启动 Live Captions
$lcPaths = @(
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\LiveCaptions.exe",
    "$env:ProgramFiles\WindowsApps\*LiveCaptions*\LiveCaptions.exe"
)
```

#### 3.2.4 添加参数验证

```powershell
if ($interval -lt 100) { $interval = 100 }
if ($title.Length -gt 256) { $title = $title.Substring(0, 256) }
```

#### 3.2.5 添加 PS1 错误 trap

```powershell
trap {
    $errObj = @{ type = "fatal"; message = $_.Exception.Message; ... }
    [Console]::Error.WriteLine($errObj | ConvertTo-Json -Compress)
    exit 1
}
```

### 3.3 PS1 拆分提议

```
src/scripts/
├── uia-common.psm1    ← 共享模块（Export-ModuleMember）
├── watch-window.ps1   ← 仅 Invoke-Watch
└── read-captions.ps1  ← 仅 Invoke-Capture
```

---

## 4. 开发体验与配置系统

### 4.1 配置系统重构

**当前问题：** 仅 3 个 CLI 参数、无配置文件、无环境变量、无校验、无 help/version。

**目标：** 4 层配置优先级

```
CLI 参数（最高）
   ↓ 覆盖
配置文件（--config 或自动发现 .live-captions.json）
   ↓ 覆盖
环境变量（LIVE_CAPTIONS_VAULT, LIVE_CAPTIONS_DIR 等）
   ↓ 覆盖
默认值（defaultConfig）
```

### 4.2 CLI 改进

- 新增 `--help`/`-h`、`--version`、`--verbose`/`-v`、`--config`/`-c`、`--log-file`、`--no-color`
- 所有参数值缺失时报错退出
- 未知参数显示警告
- 参数值校验（路径存在性、间隔最小值）

### 4.3 结构化日志

创建 `src/logger.ts`：

| 级别 | 用途 | 默认显示 |
|------|------|----------|
| `error` | 不可恢复错误 | 是 |
| `warn` | 非致命问题 | 是 |
| `info` | 正常操作信息 | 是 |
| `debug` | 详细信息（仅 `--verbose`） | 否 |

替换全项目 `console.log`，日志格式：`[timestamp] [tag] message`

### 4.4 npm scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "start": "tsx src/index.ts",
    "build": "tsc",
    "lint": "eslint src/",
    "format": "prettier --write \"src/**/*.ts\"",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "audit": "npm audit --audit-level=high"
  }
}
```

### 4.5 启动脚本合并

当前 4 个启动脚本（`launcher.ps1`、`launcher.bat`、`start.bat`、`start-hidden.vbs`）功能重叠。建议：

- 保留 `start.bat` — 前台运行（调试用）
- 合并 `launcher.bat` — 后台启动 + 打开实时字幕（日常使用）
- 删除 `start-hidden.vbs`

### 4.6 首次运行体验

`src/setup-wizard.ts` — 交互式配置初始化向导：

1. 询问 vault 路径
2. 询问字幕目录名
3. 询问窗口标题
4. 写入 `.live-captions.json`
5. 可选：添加开机自启动

---

## 5. CI/CD 与 GitHub 集成

### 5.1 当前 CI 问题

- `lint` job 和 `build` job 做同样的事（tsc --noEmit），完全冗余
- 没有 ESLint 检查
- 没有测试步骤
- 没有构建产物
- 没有安全审计
- PowerShell 检查只覆盖了一个文件（缺少 `launcher.ps1`）

### 5.2 重写 CI 工作流

```yaml
jobs:
  lint:           # ESLint 检查
  typecheck:      # Node 18/20/22 矩阵
  powershell-check: # 检查所有 .ps1 文件
  test:           # vitest run
  build:          # tsc → upload dist/ artifacts
  audit:          # npm audit (continue-on-error)
```

### 5.3 发布工作流

```yaml
# 触发条件: push tag v*
release.yml:
  - tsc 编译
  - 生成 changelog (git log)
  - gh release create (dist + scripts)
```

### 5.4 贡献基础设施

| 文件 | 用途 |
|------|------|
| `.github/ISSUE_TEMPLATE/bug_report.md` | Bug 报告模板 |
| `.github/ISSUE_TEMPLATE/feature_request.md` | 功能请求模板 |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR 描述模板 |
| `.github/CONTRIBUTING.md` | 贡献指南 |
| `.github/CODEOWNERS` | 代码审查分配 |
| `.github/dependabot.yml` | 自动依赖更新（npm + actions） |

### 5.5 gh CLI 集成

```bash
# PR 管理
gh pr status
gh pr list --review-requested "@me"
gh pr checks <pr-number>
gh pr create --title "feat: ..." --body "Closes #123"
gh pr merge <pr-number> --squash --delete-branch

# Release 管理
gh release create v1.0.0 --title "v1.0.0" --notes "..." dist/*
```

---

## 6. 优先级路线图

### Phase 1（P0 — 立即执行）

| # | 事项 | 类型 | 工作量 |
|---|------|------|--------|
| 1 | 修复空 catch 块 | 错误处理 | 5min |
| 2 | PS1 手动 JSON 转义 → ConvertTo-Json | 安全 | 10min |
| 3 | 修复 keybd_event → 直接启动 Live Captions | 安全 | 15min |
| 4 | 安装 vitest + extractNewLines 单元测试 | 测试 | 30min |
| 5 | 添加 uncaughtException/unhandledRejection | 健壮性 | 10min |
| 6 | CLI 参数校验（缺值报错、--help） | DX | 15min |
| 7 | npm scripts + tsconfig 增强 | DX | 10min |

### Phase 2（P1 — 下一个迭代）

| # | 事项 | 类型 | 工作量 |
|---|------|------|--------|
| 8 | PS1 拆分为 uia-common.psm1 + watch/capture | 架构 | 30min |
| 9 | 抽取 PsProcess 类 | 架构 | 45min |
| 10 | 创建结构化 Logger | DX | 30min |
| 11 | 配置文件支持（JSON + 环境变量） | DX | 30min |
| 12 | 添加 ESLint + Prettier | 工具链 | 20min |
| 13 | 启动脚本合并清理 | DX | 10min |
| 14 | 重写 CI（解耦 job + audit） | CI/CD | 20min |

### Phase 3（P2 — 中期）

| # | 事项 | 类型 | 工作量 |
|---|------|------|--------|
| 15 | TypedEventEmitter 类型安全事件 | 架构 | 20min |
| 16 | 服务接口 + CaptureOrchestrator | 架构 | 60min |
| 17 | Config 按接口隔离 | 架构 | 15min |
| 18 | writer 异步 I/O | 性能 | 15min |
| 19 | PS1 进程健康监控 + 心跳 | 健壮性 | 30min |
| 20 | 添加 Issue/PR 模板 + CONTRIBUTING.md | 社区 | 20min |
| 21 | release.yml 发布工作流 | CI/CD | 15min |
| 22 | 配置 Dependabot | CI/CD | 5min |

### Phase 4（P3 — 长期）

| # | 事项 | 类型 | 工作量 |
|---|------|------|--------|
| 23 | 首次运行设置向导 | DX | 30min |
| 24 | Windows 开机自启动 | DX | 20min |
| 25 | npm 发布配置 | 分发 | 15min |
| 26 | 集成测试 + E2E 测试 | 测试 | 60min |

---

## 附录：项目结构演变

### 当前

```
src/
├── index.ts
├── config.ts
├── monitor.ts
├── capture.ts
├── writer.ts
└── scripts/
    └── uia-capture.ps1
```

### 重构后

```
src/
├── index.ts                    # 精简：CLI → 工厂 → orchestrate
├── cli.ts                      # [新] CLI 参数解析、help
├── config.ts                   # Config 接口 + 子接口
├── config-loader.ts            # [新] 多源配置合并
├── logger.ts                   # [新] 结构化日志
├── orchestrator.ts             # [新] 编排层
├── interfaces.ts               # [新] 服务接口
├── monitor.ts                  # 简化：依赖 PsProcess
├── capture.ts                  # 简化：依赖 PsProcess + dedup
├── writer.ts                   # 异步 I/O
├── setup-wizard.ts             # [新] 初始化向导
├── lib/
│   ├── ps-process.ts           # [新] PowerShell 进程管理
│   ├── typed-event-emitter.ts  # [新] 类型安全事件
│   └── dedup.ts                # [新] 去重纯函数
├── __tests__/
│   ├── config.test.ts
│   ├── capture.test.ts
│   ├── writer.test.ts
│   └── dedup.test.ts
└── scripts/
    ├── uia-common.psm1         # [新] 共享 PS1 模块
    ├── watch-window.ps1        # [新] 仅窗口检测
    └── read-captions.ps1       # [新] 仅字幕提取
```

# live-captions-to-obsidian 可AI重构文档

> **元信息**
> - 一句话定位：Windows 11 实时字幕（Live Captions）→ Obsidian 每日笔记的后台自动捕获 CLI 工具（Node 18+ / TypeScript / tsx 直跑，PowerShell UIA 抓取）。
> - 生成日期：2026-07-28
> - 复现深度：精确级（**现状快照**）——单凭本文档，AI 可完全复现该项目当前状态。
> - 与 README.md 的关系：README（9.6KB）为面向用户的介绍文档，部分描述（如"seen-lines set 去重"）与实际实现（前缀比较增量算法）不一致，以本文档为准。
> - 与 REFACTORING-PLAN.md 的关系：该文件为 2026-05-27 生成的改造计划，其 Phase 1/2/4/5/6 大部分已在当前代码中落地（app.ts/lifecycle.ts/lib 三件套/测试/CI 均已存在并接线）；**本文档不预设其执行**，仅记录当前实际状态，未落地项在第 10 章列出。
> - 密钥零收录声明：本项目无任何密钥/凭据；文档中的用户路径一律以 `%USERPROFILE%`、`C:\Users\<user>` 等结构示例化，不含真实敏感信息。

---

## 1. 项目概述

**定位**：一个仅在 Windows 上运行的本地 CLI 工具。它在后台轮询检测 Windows 11 "实时字幕"（Live Captions，快捷键 `Win+Ctrl+L`）窗口；窗口出现后，通过 PowerShell + Windows UI Automation（UIA）持续抓取字幕文本，做增量去重后，以带时间戳的行追加到 Obsidian vault 内的每日 Markdown 笔记（`字幕-YYYY-MM-DD.md`）。窗口关闭则停止捕获并回到监控状态，循环往复。零运行时 npm 依赖（仅 devDependencies，运行靠 tsx + Node 内置模块 + 系统 PowerShell）。

**编号功能清单**：

| 编号 | 功能 | 实现位置 |
|------|------|----------|
| F1 | 窗口监控：按 `watchInterval`（默认 2000ms）轮询实时字幕窗口是否存在，发出 appear/gone 事件 | `src/monitor.ts` + `src/scripts/watch-window.ps1` |
| F2 | 字幕抓取：窗口出现后按 `captureInterval`（默认 500ms）通过 UIA 读取窗口内全部 Text 控件文本 | `src/capture.ts` + `src/scripts/read-captions.ps1` + `src/scripts/uia-common.psm1` |
| F3 | 增量去重：对每次轮询返回的累积文本块，与上次全文比较提取真正新增行（前缀比较 + 最长公共前缀回退） | `src/lib/dedup.ts` |
| F4 | Obsidian 写入：按日期命名文件、首建写文件头、同日多次会话用 `---` 分隔、每行加 `HH:MM:SS \|` 时间戳前缀、跨日自动滚动新文件 | `src/writer.ts` |
| F5 | 分层配置：CLI 参数 > 配置文件（`.live-captions.json`）> 环境变量（`LIVE_CAPTIONS_*`）> 默认值 | `src/config.ts` + `src/config-loader.ts` + `src/cli.ts` |
| F6 | CLI 交互：`--help/--version/--vault/--dir/--title/--watch/--capture/--config/--verbose/--log-file/--no-color`，配置校验失败带错误列表退出 | `src/cli.ts` + `src/index.ts` |
| F7 | 进程生命周期：SIGINT/SIGTERM/uncaughtException/unhandledRejection 处理，优雅停止 PowerShell 子进程（exit 命令 → SIGTERM → SIGKILL 三级） | `src/lifecycle.ts` + `src/lib/ps-process.ts` |
| F8 | 结构化日志器（已实现、**尚未接入主流程**）：等级过滤、ISO 时间戳、可选文件输出、noColor | `src/logger.ts` |
| F9 | 一键启动器：后台启动捕获工具 + 拉起 Live Captions（直接启动 exe，失败回退模拟快捷键） | `launcher.ps1` + `start-hidden.vbs` |
| F10 | 工程化：ESLint 9 flat config、Prettier、Vitest（9 个测试文件）、tsc 严格模式、GitHub Actions CI（lint/typecheck×3 Node 版本/ps 语法检查/test/build/audit） | 根级配置 + `.github/workflows/ci.yml` |

<!-- SECTION 1 END -->

## 2. 技术栈与环境

### 2.1 精确版本表（逐字来自 package.json devDependencies）

运行时依赖：**无**（`dependencies` 字段不存在）。

| 包 | 版本约束 | 用途 |
|----|---------|------|
| `@types/node` | `^25.9.1` | Node 类型定义 |
| `@typescript-eslint/eslint-plugin` | `^8.0.0` | TS lint 规则 |
| `@typescript-eslint/parser` | `^8.0.0` | TS lint 解析器 |
| `@vitest/coverage-v8` | `^3.2.4` | 覆盖率 |
| `eslint` | `^9.0.0` | Lint（flat config） |
| `prettier` | `^3.0.0` | 格式化 |
| `rimraf` | `^6.0.0` | （声明但脚本未使用） |
| `tsx` | `^4.0.0` | 直接运行 TS（唯一运行入口） |
| `typescript` | `^5.0.0` | 编译/类型检查 |
| `vitest` | `^3.2.4` | 测试框架 |

其他 package.json 关键字段（逐字）：

```json
"name": "live-captions-to-obsidian",
"version": "1.0.0",
"description": "Auto-capture Windows Live Captions text to Obsidian notes",
"engines": { "node": ">=18" },
"type": "module"
```

### 2.2 全部 npm scripts（逐字）

```json
"scripts": {
  "dev": "tsx watch src/index.ts",
  "start": "tsx src/index.ts",
  "build": "tsc",
  "lint": "eslint src/",
  "lint:fix": "eslint src/ --fix",
  "format": "prettier --write \"src/**/*.ts\"",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "typecheck": "tsc --noEmit",
  "audit": "npm audit --audit-level=high"
}
```

### 2.3 tsconfig.json（逐字全文）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

注意：`"type": "module"` + `moduleResolution: bundler`，所以 **TS 源码内相对导入一律带 `.js` 后缀**（如 `import { Config } from "./config.js"`），tsx 与 vitest 均可解析。

### 2.4 ESLint（eslint.config.js，flat config，要点）

三段配置：
1. `src/**/*.ts`：parser 为 `@typescript-eslint/parser`（ecmaVersion 2022, sourceType module）。规则：`no-console: warn`、`no-empty: ["error", { allowEmptyCatch: false }]`、`@typescript-eslint/no-unused-vars: error`、`@typescript-eslint/no-explicit-any: error`、`@typescript-eslint/explicit-function-return-type: ["warn", { allowExpressions: true, allowTypedFunctionExpressions: true }]`、`max-depth: ["warn", 4]`、`max-params: ["warn", 4]`。
2. `src/**/*.test.ts`：关闭 `no-console`、`max-lines`。
3. CLI/日志白名单文件关闭 `no-console`（逐字文件列表）：`src/index.ts`, `src/cli.ts`, `src/logger.ts`, `src/lifecycle.ts`, `src/app.ts`, `src/monitor.ts`, `src/capture.ts`, `src/config-loader.ts`, `src/lib/typed-event-emitter.ts`。

### 2.5 Prettier（.prettierrc 逐字）

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

`.prettierignore`：`dist/`、`node_modules/`、`src/scripts/*.ps1`。

### 2.6 vitest.config.ts（逐字全文）

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/__tests__/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/__tests__/**", "src/scripts/**"],
    },
  },
});
```

### 2.7 CI（.github/workflows/ci.yml 要点）

- 触发：push/PR 到 main；concurrency 按 workflow+ref 取消进行中。
- 全部 job 运行于 `windows-latest`：
  - `lint`：Node 20，`npx eslint src/`
  - `typecheck`：矩阵 Node `[18, 20, 22]`，`npx tsc --noEmit`
  - `powershell-check`：pwsh 用 `[System.Management.Automation.Language.Parser]::ParseFile` 对 `src/scripts` 与根级全部 `*.ps1,*.psm1` 做语法检查
  - `test`：Node 20，`npx vitest run --reporter=verbose`
  - `build`：needs 上述四个，`npx tsc` 并上传 `dist/` artifact（保留 7 天）
  - `audit`：`npm audit --audit-level=high`，`continue-on-error: true`

### 2.8 运行前置条件

| 条件 | 要求 | 说明 |
|------|------|------|
| 操作系统 | Windows 11（任意版本） | 需具备 Live Captions 功能；`Win+Ctrl+L` 开启 |
| Node.js | ≥ 18 | `engines` 强制 |
| PowerShell | 5.1+（Windows 自带） | 子进程以 `powershell -NoProfile -ExecutionPolicy Bypass -File <脚本>` 启动 |
| UIA 程序集 | `UIAutomationClient` / `UIAutomationTypes` | .NET 自带，psm1 内 `Add-Type` 加载 |
| Obsidian vault 路径 | 默认 `%USERPROFILE%\Documents\Obsidian` | 不存在会自动 `mkdir -recursive`（notesDir 层级）；可用 `--vault`、配置文件 `vaultPath`、环境变量 `LIVE_CAPTIONS_VAULT` 覆盖 |
| 窗口标题语言 | 默认匹配中文标题"实时字幕" | 英文系统需 `--title "Live Captions"`；但主查找路径按窗口类名 `LiveCaptionsDesktopWindow`，与语言无关（标题仅作回退匹配与文本过滤） |

<!-- SECTION 2 END -->

## 3. 目录结构

带中文注释目录树（排除 node_modules/dist；src 下 25 个文件全部列出）：

```
live-captions-to-obsidian/
├── .github/
│   ├── CONTRIBUTING.md            # 贡献指南
│   ├── PULL_REQUEST_TEMPLATE.md   # PR 模板
│   ├── dependabot.yml             # 依赖机器人配置
│   ├── ISSUE_TEMPLATE/            # issue 模板（2 个）
│   └── workflows/
│       └── ci.yml                 # CI：lint/typecheck/ps 语法/test/build/audit（见 2.7）
├── src/
│   ├── index.ts                   # 入口：解析 CLI → 解析配置 → 校验 → 创建 Application 并启动（31 行）
│   ├── app.ts                     # Application 编排器：事件接线、捕获会话生命周期（107 行）
│   ├── lifecycle.ts               # 进程信号处理注册（31 行）
│   ├── cli.ts                     # CLI 参数解析/帮助/版本/配置校验（117 行）
│   ├── config.ts                  # Config 接口 + defaultConfig（18 行）
│   ├── config-loader.ts           # 四层配置解析（CLI>文件>环境>默认）（116 行）
│   ├── logger.ts                  # 结构化 Logger（已实现未接线）（103 行）
│   ├── monitor.ts                 # WindowMonitor：驱动 watch-window.ps1（91 行）
│   ├── capture.ts                 # CaptureService：驱动 read-captions.ps1 + 去重（101 行）
│   ├── writer.ts                  # ObsidianWriter：每日 md 文件异步追加（67 行）
│   ├── lib/
│   │   ├── dedup.ts               # extractNewLines 纯函数（去重核心算法）（43 行）
│   │   ├── ps-process.ts          # PowerShell 子进程封装（spawn/JSON行解析/三级停止）（106 行）
│   │   └── typed-event-emitter.ts # 类型安全事件发射器（38 行）
│   ├── scripts/
│   │   ├── uia-common.psm1        # 共享 UIA 模块：找窗口/读文本/非阻塞 stdin（149 行）
│   │   ├── watch-window.ps1       # 窗口存在性轮询脚本（114 行）
│   │   └── read-captions.ps1      # 字幕文本抓取脚本（124 行）
│   └── __tests__/
│       ├── app.test.ts            # Application 构造/停止冒烟（14 行）
│       ├── cli.test.ts            # parseArgs/validateConfig 全参数覆盖（114 行）
│       ├── config.test.ts         # defaultConfig 字段与取值范围（42 行）
│       ├── config-loader.test.ts  # resolveConfig 层级优先级（58 行）
│       ├── dedup.test.ts          # 去重算法 10 个边界用例（70 行）
│       ├── logger.test.ts         # Logger 等级过滤/时间戳（59 行）
│       ├── ps-process.test.ts     # PsProcess 未启动态安全性（24 行）
│       ├── typed-event-emitter.test.ts # 事件器 on/off/emit/异常隔离（87 行）
│       └── writer.test.ts         # 写入器文件头/分隔符/时间戳格式（112 行）
├── launcher.ps1                   # 一键启动器（全文见 6.5）
├── start-hidden.vbs               # 隐藏窗口启动 start.bat（注意：start.bat 已被删除，见第 10 章）
├── eslint.config.js               # ESLint flat config（见 2.4）
├── .prettierrc / .prettierignore  # 格式化配置（见 2.5）
├── vitest.config.ts               # 测试配置（见 2.6）
├── tsconfig.json                  # TS 配置（见 2.3）
├── package.json / package-lock.json
├── .gitignore                     # node_modules/ dist/ *.js.map .DS_Store Thumbs.db
├── LICENSE                        # MIT
├── README.md                      # 用户文档（部分内容已过时）
└── REFACTORING-PLAN.md            # 改造计划（本文档不预设其执行）
```

<!-- SECTION 3 END -->

## 4. 数据模型

### 4.1 配置类型与默认值（src/config.ts 逐字）

```typescript
export interface Config {
  vaultPath: string;
  notesDir: string;
  watchInterval: number;
  captureInterval: number;
  windowTitle: string;
}

export const defaultConfig: Config = {
  vaultPath: path.join(os.homedir(), "Documents", "Obsidian"),
  notesDir: "notes",
  watchInterval: 2000,
  captureInterval: 500,
  windowTitle: "实时字幕",
};
```

### 4.2 配置文件结构（src/config-loader.ts 逐字）

```typescript
export interface ConfigFile {
  vaultPath?: string;
  notesDir?: string;
  watchInterval?: number;
  captureInterval?: number;
  windowTitle?: string;
  logging?: {
    verbose?: boolean;
    logFile?: string;
  };
}
```

- 配置文件名常量（逐字）：`const CONFIG_FILE_NAMES = [".live-captions.json", "live-captions.json"];`
- 发现顺序：`process.cwd()` 下两个文件名 → `USERPROFILE`/`HOME` 下两个文件名，取第一个存在者。
- `logging` 字段被读入但当前**保留未用**（解构后 `void _logging`）。
- 示例配置文件内容：

```json
{
  "vaultPath": "D:\\MyVault",
  "notesDir": "captions",
  "windowTitle": "Live Captions",
  "watchInterval": 3000,
  "captureInterval": 1000
}
```

### 4.3 CLI 选项类型（src/cli.ts 逐字）

```typescript
export interface CliOptions {
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  configPath?: string;
  logFile?: string;
  noColor?: boolean;
}
```

### 4.4 事件类型定义（逐字）

```typescript
// src/capture.ts
export interface CaptureEvents {
  text: [lines: string[]];
  gone: [];
  error: [err: Error];
  [key: string]: unknown[];
}

// src/monitor.ts
export type MonitorEvents = {
  appear: [];
  gone: [];
  error: [Error];
};
```

### 4.5 去重结果类型（src/lib/dedup.ts 逐字）

```typescript
export interface DedupResult {
  newLines: string[];
  currentText: string;
}
```

### 4.6 日志类型（src/logger.ts 逐字节选）

```typescript
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  level: LogLevel;
  verbose: boolean;
  logFile?: string;
  noColor: boolean;
}

export interface LoggerLike {
  info(tag: string, message: string): void;
  error(tag: string, message: string): void;
  debug(tag: string, message: string): void;
  warn(tag: string, message: string): void;
}
```

（`capture.ts` 与 `monitor.ts` 各自内联了一个不含 `warn` 的三方法 `LoggerLike` 接口，与 logger.ts 的四方法版本并存。）

### 4.7 Node ↔ PowerShell IPC 消息结构（stdin/stdout 单行 JSON）

Node → PS（stdin，每行一个 JSON 对象 + `\n`）：

| 消息 | 结构 | 说明 |
|------|------|------|
| watch 命令 | `{"cmd":"watch","title":"实时字幕","interval":2000}` | monitor 启动后发送 |
| capture 命令 | `{"cmd":"capture","title":"实时字幕","interval":500}` | capture 启动后发送 |
| exit 命令 | `{"cmd":"exit"}` | 优雅停止 |

PS → Node（stdout，每行一个 compact JSON）：

| 消息 | 结构 | 发送方 | 说明 |
|------|------|--------|------|
| status | `{"type":"status","found":true\|false}` | watch-window.ps1 | 每个轮询周期发送 |
| text | `{"type":"text","lines":["行1","行2"]}` | read-captions.ps1 | 每个轮询周期的**累积**全量文本行 |
| gone | `{"type":"gone"}` | read-captions.ps1 | 窗口消失/句柄失效，随后脚本 return 回主循环 |
| heartbeat | `{"type":"heartbeat"}` | 两个 ps1 | 每 10 次迭代发送一次 |
| error | `{"type":"error","message":"..."}` | 两个 ps1 | stdin 收到非法 JSON 或未知命令 |
| fatal | `{"type":"fatal","message":..,"line":..,"category":..}` | trap 块 | 写入 **stderr** 后 exit 1 |

### 4.8 输出 Markdown 文件格式规范

- 文件路径：`<vaultPath>/<notesDir>/字幕-YYYY-MM-DD.md`（本地时区日期，`YYYY-MM-DD` 补零）。
- 文件首次创建时写文件头：`# 字幕笔记 - YYYY年M月D日\n\n`（显示日期**不补零**）。
- 文件已存在时（同日再次开始会话）：追加 `\n---\n\n`。
- 每次会话开始追加：`> HH:MM:SS 开始捕获\n\n`。
- 每条字幕行格式：`HH:MM:SS | <字幕文本>`，多行以 `\n` 连接，末尾补 `\n`。
- 跨日：写入时发现日期变化则切换到新文件并重新 `beginSession()`。
- 完整示例：

```markdown
# 字幕笔记 - 2026年7月28日

> 14:30:15 开始捕获

14:30:15 | 大家好，欢迎来到今天的分享
14:30:18 | 今天我们要讨论的是人工智能的发展

---

> 15:45:02 开始捕获

15:45:02 | 下午好，我们继续刚才的话题
```

<!-- SECTION 4 END -->

## 5. API 契约

本项目为本地 CLI 工具，**无 HTTP/网络 API**。唯二的接口契约是：

1. **进程间接口**：Node 主进程与两个 PowerShell 子进程之间的 stdin/stdout 行式 JSON 协议，已在 4.7 完整定义。子进程启动命令固定为：
   `powershell -NoProfile -ExecutionPolicy Bypass -File <scriptPath>`，stdio 均为 pipe。
2. **文件系统接口**：对 Obsidian vault 的追加写（格式见 4.8）。Obsidian 侧无需任何插件，纯文件层集成。

CLI 参数接口见 7.3（cli.ts）；环境变量接口：`LIVE_CAPTIONS_VAULT`、`LIVE_CAPTIONS_DIR`、`LIVE_CAPTIONS_TITLE`、`LIVE_CAPTIONS_WATCH_INTERVAL`、`LIVE_CAPTIONS_CAPTURE_INTERVAL`（后两者 `parseInt(x, 10)` 解析）。

<!-- SECTION 5 END -->

## 6. 核心业务逻辑与算法【重点】

### 6.1 Live Captions 文本抓取机制（UIA）

**窗口查找**（uia-common.psm1 `Find-LiveCaptionsWindow`，关键调用逐字）：

```powershell
$root = [System.Windows.Automation.AutomationElement]::RootElement

# Primary: find by window class name (encoding-safe, reliable)
$classCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ClassNameProperty,
    'LiveCaptionsDesktopWindow'
)
$window = $root.FindFirst(
    [System.Windows.Automation.TreeScope]::Children,
    $classCondition
)
if ($window) { return $window }
```

- **主路径**：按窗口类名 `LiveCaptionsDesktopWindow` 在桌面根的直接子元素中 `FindFirst`（与显示语言无关）。
- **回退路径**：`FindAll` 所有 `ControlType.Window` 子元素，逐个取 `$w.Current.Name`，用 `-like "*$Title*"` 子串匹配标题；单个元素读取异常时 `catch { continue }`。
- 入参防御：`$Title.Length -gt 256` 时 throw。
- UIA 程序集加载（psm1 顶部逐字）：`Add-Type -AssemblyName 'UIAutomationClient'`、`Add-Type -AssemblyName 'UIAutomationTypes'`，失败则 `Write-Error` + exit 1。

**文本提取**（`Get-CaptionText`，关键调用逐字）：

```powershell
$textCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Text
)
$textElements = $Window.FindAll(
    [System.Windows.Automation.TreeScope]::Descendants,
    $textCondition
)
```

- 在窗口的**全部后代**中查找 `ControlType.Text` 元素；`FindAll` 抛异常（句柄失效）→ 返回 `$null`（上层据此发 gone）。
- 逐元素取 `Name`，过滤条件：非空、`Trim().Length -gt 0`、**且不等于窗口标题 `$Title`**（排除标题栏文本元素）；元素在 find 与 read 之间被销毁则 `catch { continue }`。
- 返回 `List[string]`（可能为空列表——空列表≠null，空列表照常发 text 消息）。

**轮询策略**（read-captions.ps1 `Invoke-Capture`）：
- `while($true)` 循环：每轮先 `Find-LiveCaptionsWindow`，找不到 → 发 `{"type":"gone"}` 并 return；找到 → `Get-CaptionText`，结果为 `$null`（读取中途句柄丢失）同样发 gone 并 return。
- 正常则发 `@{ type = "text"; lines = $lines } | ConvertTo-Json -Compress`。
- 每 10 次迭代发一次 heartbeat。
- 等待间隔采用**可中断休眠**：`$deadline = [DateTime]::UtcNow.AddMilliseconds($Interval)`，循环内 `Read-StdinLine -TimeoutMs 200` 检查 exit 命令，收到 `{"cmd":"exit"}` 立即 return。
- watch-window.ps1 的 `Invoke-Watch` 结构完全相同，只是每轮发 `{"type":"status","found":$found}`。

**非阻塞 stdin 读取**（`Read-StdinLine`，核心逐字）：

```powershell
if ([Console]::In.Peek() -lt 0) {
    return $null
}
$task = [Console]::In.ReadLineAsync()
if ($task.Wait($TimeoutMs)) {
    return $task.Result
}
return $null
```

- `TimeoutMs -lt 100` 时 throw；`Peek() -lt 0` 表示 stdin 已关闭（父进程死亡），两个 ps1 主循环据此 `exit 0` 自杀，防止孤儿进程。
- 两个 ps1 主循环：`Read-StdinLine -TimeoutMs 500` → 空行跳过 → `ConvertFrom-Json` 失败发 error 消息 → `switch ($parsed.cmd)` 分派到 `watch`/`capture`/`exit`/default(error)。缺省参数（逐字）：title 默认 `'实时字幕'`，interval 默认 watch=2000 / capture=500。
- 编码：两个 ps1 与 psm1 头部均强制 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8` 与 `$OutputEncoding = UTF8`，保证中文字幕经 stdout 正确到达 Node。
- 错误兜底：三个脚本均有相同 `trap` 块，把 `{type:"fatal", message, line, category}` compact JSON 写 stderr 后 exit 1。

### 6.2 去重/增量合并算法【核心，src/lib/dedup.ts 全文逐字】

Live Captions 窗口内的文本是一个**滚动累积文本块**：多数时刻只在尾部追加，但窗口滚动/识别修正时头部会被裁剪或中段被改写。算法以"上次全文 prevText vs 本次全文 currentText"做增量提取：

```typescript
export function extractNewLines(rawLines: string[], prevText: string): DedupResult {
  const currentText = rawLines.join("\n");
  if (!currentText) return { newLines: [], currentText };

  let newContent: string;

  if (currentText.startsWith(prevText)) {
    // 正常情况：文本追加增长
    newContent = currentText.substring(prevText.length);
  } else {
    // 文本被重写 — 找最长公共前缀
    let i = 0;
    while (
      i < currentText.length &&
      i < prevText.length &&
      currentText[i] === prevText[i]
    ) {
      i++;
    }
    newContent = currentText.substring(i);
  }

  if (!newContent.trim()) return { newLines: [], currentText };

  return {
    newLines: newContent.split("\n").filter((l) => l.trim().length > 0),
    currentText,
  };
}
```

**完整规则与边界条件**（与 dedup.test.ts 的 10 个用例一一对应）：

| 场景 | 输入关系 | 行为 |
|------|---------|------|
| 首次调用 | `prevText === ""` | `startsWith("")` 恒真，全部行视为新增 |
| 正常追加 | currentText 以 prevText 为前缀 | 返回前缀之后的部分按 `\n` 切分 |
| 内容不变 | currentText === prevText | 差为空串 → `newLines: []` |
| 完全重写 | 无公共前缀 | LCP=0，全文视为新增 |
| 部分重写 | `"开始；旧结尾"` → `"开始；新结尾"` | 从 LCP 断点起返回 `"新结尾"`（**注意：断点可落在行中间，返回的是残行**） |
| 空输入 | `rawLines: []` | `currentText` 为空串 → 返回 `{[], ""}`，**prevText 被重置为空**，下轮全量视为新（窗口清屏后重新累积的正确行为） |
| 纯空白 | 行均为空白 | join 后非空但 `trim()` 为空 → `newLines: []`，currentText 保留原样 |
| 空行过滤 | 新增段含 `""`/`"  "` | `filter((l) => l.trim().length > 0)` 剔除 |
| 文本滚动（头部裁剪） | 旧头部行被移出窗口 | 首字符即不同 → LCP 极短 → **已写过的行会被再次返回（重复写入）**，这是当前实现的已知局限（见第 10 章；REFACTORING-PLAN §1.5 提议的 prevTail 重叠分支**未落地**） |

**状态管理**（capture.ts 侧）：`prevText` 保存在 `CaptureService` 实例字段；`start()`/`stop()`/`resetDedup()` 均重置为 `""`。每条 text 消息处理（逐字）：

```typescript
const result = extractNewLines(parsed.lines, this.prevText);
this.prevText = result.currentText;
if (result.newLines.length > 0) {
  this.emit("text", result.newLines);
}
```

**双 gone 防护**：`goneEmitted` 标志——PS 发 gone 消息置 true 并 emit；进程 close 回调里仅当 `!goneEmitted` 才补发 gone（PS 脚本发送 gone 后会 return 回主循环等待下一命令，进程未必立即退出；若进程异常退出未发 gone，则由 close 兜底）。

### 6.3 Obsidian 写入格式与文件命名规则

见 4.8 格式规范。实现要点（writer.ts）：
- 构造函数**同步**执行 `fs.mkdirSync(notesDir, { recursive: true })` 并确定当日文件路径；`notesDir = path.join(config.vaultPath, config.notesDir)`。
- `beginSession()`：用 `fs.promises.access` 判存在。不存在且未建过 → 写文件头并置 `fileCreated = true`；否则追加 `\n---\n\n`。随后追加 `> HH:MM:SS 开始捕获\n\n`。
- `writeLines(lines)`：先比较 `formatDate(now)` 与 `currentDate`，跨日则换文件、`fileCreated = false`、重新 `beginSession()`；然后 `lines.map((line) => `${time} | ${line}`).join("\n") + "\n"` 一次 `appendFile`。
- 日期/时间格式化为手写 `padStart(2, "0")` 纯函数（本地时区），显示日期 `formatDisplayDate` 输出 `${y}年${m}月${d}日` 不补零。

### 6.4 主流程编排（app.ts 状态机）

```
[启动] index.ts: parseArgs → resolveConfig → validateConfig → new Application → registerLifecycle → app.start()
[监控] monitor.start() 常驻。found 状态沿由 monitor.ts 内 wasFound 闭包维护，
       false→true 发 appear，true→false 发 gone（status 消息每轮都来，仅边沿触发）。
[appear] app.startCapture()：若 isCapturing 则打印"[跳过] 已在捕获中"并 return；
       否则置位、建 ObsidianWriter、beginSession()（未 await，fire-and-forget）、
       建 CaptureService 并接线 text/gone/error、capture.start()。
[text]  lineCount 累加，writer?.writeLines(lines)（未 await），单行覆盖式进度输出 `+N 条 (共 M 条)\r`。
[gone]  （capture 或 monitor 任一来源）cleanupCapture()：capture.stop()（等待 PS 退出）→
       resetDedup() → 置空 capture/writer → lineCount=0 → isCapturing=false；回到监控态。
[退出]  SIGINT/SIGTERM → app.stop()（cleanupCapture + monitor.stop）→ exit 0；
       uncaughtException → app.stop() → exit 1；unhandledRejection 仅打印。
```

### 6.5 launcher.ps1 逻辑（全文逐字收录）

```powershell
# Live Captions to Obsidian — One-click launcher
# Starts capture tool + opens Live Captions in one action

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Start capture tool in background (hidden)
$wscriptProc = Start-Process -FilePath "wscript.exe" -ArgumentList "`"$scriptDir\start-hidden.vbs`"" -WindowStyle Hidden -PassThru
Write-Host "[OK] Capture tool started in background" -ForegroundColor Green

# 2. Wait for tool to initialize
Start-Sleep -Seconds 2

# 3. Try to launch Live Captions directly (preferred, avoids keyboard simulation)
$lcFound = $false
$lcPaths = @(
    "$env:LOCALAPPDATA\Microsoft\WindowsApps\LiveCaptions.exe"
)
foreach ($p in $lcPaths) {
    if (Test-Path $p) {
        try {
            Start-Process -FilePath $p -WindowStyle Normal
            Write-Host "[OK] Live Captions launched" -ForegroundColor Green
            $lcFound = $true
            break
        } catch {
            Write-Host "[WARN] Failed to launch Live Captions directly: $_" -ForegroundColor Yellow
        }
    }
}

# 4. Fallback: simulate Win+Ctrl+L using SendKeys
if (-not $lcFound) {
    Write-Host "[INFO] Falling back to keyboard shortcut Win+Ctrl+L..." -ForegroundColor Yellow
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.SendKeys]::SendWait("^{Win}{L}")
        Write-Host "[OK] Keyboard shortcut sent" -ForegroundColor Green
    } catch {
        # Ultimate fallback: old keybd_event method
        Write-Host "[WARN] SendKeys failed, trying keybd_event..." -ForegroundColor Yellow
        $sig = '[DllImport("user32.dll")]public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);'
        $kb = Add-Type -MemberDefinition $sig -Name KB -Namespace W32 -PassThru
        $kb::keybd_event(0x5B, 0, 0, 0)   # Win down
        $kb::keybd_event(0x11, 0, 0, 0)   # Ctrl down
        $kb::keybd_event(0x4C, 0, 0, 0)   # L down
        Start-Sleep -Milliseconds 100
        $kb::keybd_event(0x4C, 0, 2, 0)   # L up
        $kb::keybd_event(0x11, 0, 2, 0)   # Ctrl up
        $kb::keybd_event(0x5B, 0, 2, 0)   # Win up
        Write-Host "[OK] Fallback keyboard shortcut sent" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "Everything is running. Close this window." -ForegroundColor Yellow
Write-Host "Subtitles auto-save to: $env:USERPROFILE\Documents\Obsidian\notes\" -ForegroundColor Cyan

try {
    Read-Host "Press Enter to exit"
} finally {
    # Kill the background capture process on exit (including window close)
    if ($wscriptProc -and -not $wscriptProc.HasExited) {
        try { Stop-Process -Id $wscriptProc.Id -Force -ErrorAction SilentlyContinue } catch {}
    }
}
```

配套 start-hidden.vbs（全文逐字）：

```vbscript
Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
objShell.Run "cmd /c start.bat", 0, False
```

⚠️ 当前仓库中 **start.bat 不存在**（改造计划 Phase 7 已将其删除，但 vbs 未同步更新），启动链断裂——详见第 10 章。

<!-- SECTION 6 END -->

## 7. 核心文件逐一说明【主体】

覆盖 src 全部 25 个文件（源码 13 + PowerShell 3 + 测试 9）。

### 7.1 src/index.ts（31 行）— 入口

- **职责**：CLI 解析 → 配置解析 → 校验 → 启动 Application。
- **实现要点**：顶层直接执行（无 main 函数）。`parseArgs(process.argv.slice(2))` → `--help`/`--version` 短路 `process.exit(0)` → `resolveConfig(cliOverrides, cliOptions.configPath)`（丢弃 sources）→ `validateConfig` 非空则打印 `[错误] 配置验证失败:` + 逐条 `  - err` 后 `exit(1)` → `new Application(config)` → `registerLifecycle(app)` → `app.start()`。
- **常量**：`RED = "\x1b[31m"`、`RESET = "\x1b[0m"`。
- **边界**：Application 构造时**未传 logger**（monitor/capture 用各自 console 回退）；cliOptions 的 verbose/logFile/noColor 被解析但**未消费**。

### 7.2 src/app.ts（107 行）— Application 编排器

- **职责**：接线 monitor/capture/writer，维护捕获会话状态。
- **实现要点**：见 6.4 状态机。私有字段 `monitor`、`capture: CaptureService | null`、`writer: ObsidianWriter | null`、`isCapturing`、`lineCount`。ANSI 常量：GREEN/YELLOW/CYAN/DIM/RED/RESET（源码注释声明这些颜色码是临时的，后续阶段将替换为结构化 Logger）。
- **关键片段**（进度输出，逐字）：``process.stdout.write(`${CYAN}  +${lines.length}${RESET} 条 (共 ${this.lineCount} 条)\r`);``
- **边界**：`startCapture()` 内 `this.writer.beginSession()` 与 text 处理器内 `this.writer?.writeLines(lines)` 均为 async 但**未 await**（同一文件的 append 顺序由 fs.promises 调用顺序保障，但错误会成为 unhandledRejection）；`cleanupCapture()` 幂等（capture 为 null 时直接清理其余字段）。

### 7.3 src/cli.ts（117 行）— CLI 解析与校验

- **职责**：parseArgs / printHelp / printVersion / validateConfig。
- **常量**：`const VERSION = "1.0.0";`（与 package.json version 手工同步）。
- **实现要点**：手写 for-switch 解析（不用库）。取值参数通过 `requireValue(argv, i++, name)`：下一项 undefined 或以 `--` 开头则打印 `[错误] 参数 --<name> 需要一个值` 并 `exit(1)`；注意 `i++` 在实参位置，消费值后跳一格。`--watch`/`--capture` 用 `parseInt(v, 10)`。未知 `--` 开头参数收集进 unknown，最后统一 `[警告] 未知参数: ...`（不退出）。
- **validateConfig 规则（逐字消息）**：`vaultPath 不能为空`、`notesDir 不能为空`、`windowTitle 不能为空`、`watchInterval 不能小于 200ms`（`< 200` 触发）、`captureInterval 不能小于 100ms`（`< 100` 触发）。
- **边界**：非 `--` 开头的裸参数被静默忽略；`parseInt` 得 NaN 时 `NaN < 200` 为 false，**NaN 间隔能通过校验**（已知缺陷，见第 10 章）。

### 7.4 src/config.ts（18 行）— 配置模型

- 全文已逐字收录于 4.1。无逻辑，仅接口 + 默认值（`os.homedir()` 拼默认 vault 路径）。

### 7.5 src/config-loader.ts（116 行）— 四层配置解析

- **职责**：`resolveConfig(cliOverrides, cliConfigPath?) → { config, sources }`。
- **合并顺序**（后者覆盖前者）：defaults → env（`LIVE_CAPTIONS_*` 五个变量，见第 5 章）→ 配置文件（`--config` 指定或自动发现，读取失败打 `[警告] 无法读取配置文件 <path>: <msg>` 且不计入 sources）→ CLI。sources 数组按序记录 `"defaults"`/`"env"`/`<configPath>`/`"cli"`。
- **边界**：配置文件中 `logging` 字段被解构剥离（`void _logging` 占位）；env 的 interval 用 parseInt 可产生 NaN 并进入 merged；配置文件 JSON 类型不校验（信任 as ConfigFile）。

### 7.6 src/logger.ts（103 行）— 结构化日志器（未接线）

- **职责**：等级过滤（debug<info<warn<error，`LEVEL_PRIORITY` 0-3）、debug 额外受 `verbose` 开关控制、ISO 时间戳、可选 WriteStream 文件输出（flags "a"）、noColor。
- **常量（逐字）**：`LEVEL_COLORS = { debug: "\x1b[2m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" }`；`LEVEL_TAGS = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR" }`。
- **输出格式**：终端 `${color}[${timestamp}] [${TAG}] [${tag}] ${message}${reset}`（console.log，附加 args 原样传递）；文件为纯文本同格式 + args JSON.stringify 拼接。
- **模块级单例**：`getLogger(options?)`——无实例或传了 options 就重建。
- **边界**：当前**没有任何生产模块 import 它**（仅测试引用）；`destroy()` 结束流。

### 7.7 src/monitor.ts（91 行）— WindowMonitor

- **职责**：驱动 `watch-window.ps1`，把周期性 status 消息转成边沿事件 appear/gone。
- **实现要点**：继承 `TypedEventEmitter<MonitorEvents>`；`scriptPath = path.join(__dirname, "scripts", "watch-window.ps1")`（`__dirname` 由 `fileURLToPath(import.meta.url)` 派生，兼容 ESM）；`start()` 内闭包 `wasFound` 实现边沿检测（见 6.4）；start 后立即 `sendCommand({ cmd: "watch", title, interval })`。
- **边界**：onClose 时若 `wasFound` 为 true 补发 gone；退出码非 0 记录 error 日志；onStderr 转发到 logger.error；可选注入 LoggerLike，缺省用 `[monitor]` 前缀 console。

### 7.8 src/capture.ts（101 行）— CaptureService

- **职责**：驱动 `read-captions.ps1`，消息分派（text→去重→emit / gone / heartbeat），维护 `prevText` 与 `goneEmitted`。
- **实现要点**：核心消息处理与双 gone 防护已逐字收录于 6.2；`scriptPath` 指向 `scripts/read-captions.ps1`；start 后发 `{ cmd: "capture", title, interval }`；`stop()` 停进程并清 prevText；`resetDedup()` 清 prevText + goneEmitted。
- **常量**：`const TAG = "capture";`
- **边界**：text 消息需同时满足 `parsed.type === "text"` 且 `Array.isArray(parsed.lines)`；未注入 logger 时回退 `[INFO]/[ERROR]/[DEBUG]` console。

### 7.9 src/writer.ts（67 行）— ObsidianWriter

- **职责/要点**：见 6.3 与 4.8。三个格式化纯函数 `formatDate`/`formatTime`/`formatDisplayDate` 为模块私有。
- **关键片段**（跨日滚动，逐字）：

```typescript
const today = formatDate(now);
if (today !== this.currentDate) {
  this.currentDate = today;
  this.filePath = path.join(this.notesDir, `字幕-${today}.md`);
  this.fileCreated = false;
  await this.beginSession();
}
```

- **边界**：构造函数同步建目录（vaultPath 不存在时 recursive 一并创建）；`fileCreated` 防止同实例重复写头；文件被外部删除后再 writeLines 会由 appendFile 隐式重建（无文件头）。

### 7.10 src/lifecycle.ts（31 行）— 信号处理

- **职责**：`registerLifecycle(app: AppLike)` 注册 4 个进程钩子（见 6.4 [退出]）。`AppLike = { stop(): Promise<void> }` 结构化接口，便于测试替身。
- **边界**：unhandledRejection 只打印不退出；SIGINT/SIGTERM 处理器为 async，stop 挂起时进程不退出（PsProcess.stop 内部有 5s 兜底强杀，见 7.12）。

### 7.11 src/lib/dedup.ts（43 行）— 去重算法

- 全文已逐字收录于 6.2，此处不重复。纯函数、无状态、无依赖。

### 7.12 src/lib/ps-process.ts（106 行）— PowerShell 子进程封装

- **职责**：spawn / 行缓冲 JSON 解析 / 命令写入 / 三级优雅停止。
- **spawn 关键调用（逐字）**：

```typescript
this.proc = spawn("powershell", [
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  options.scriptPath,
], { stdio: ["pipe", "pipe", "pipe"] });
```

- **stdout 行解析**：`buffer += chunk; lines = buffer.split("\n"); buffer = lines.pop() ?? "";` 逐行 trim、跳空、`JSON.parse` 失败静默忽略（非 JSON 行容忍）。stderr 每 chunk trim 后经 `onStderr` 转发。
- **停止时序常量（逐字）**：`CLEANUP_KILL_TIMEOUT_MS = 3000`、`CLEANUP_FORCE_KILL_TIMEOUT_MS = 2000`。`stop()`：立即写 `{"cmd":"exit"}\n`（写失败则直接 kill 并 resolve）→ 3s 后 `SIGTERM` → 5s 后 `SIGKILL` 并 resolve；期间 close 事件到达则清定时器 resolve。
- **边界**：`sendCommand` 在 stdin 关闭时静默吞异常；`isRunning = proc !== null && !proc.killed`；`kill()` 为立即强停（当前无生产调用方）。

### 7.13 src/lib/typed-event-emitter.ts（38 行）— 类型安全事件器

- **职责**：`TypedEventEmitter<Events extends Record<string, unknown[]>>`，提供 `on/off/emit/removeAllListeners/listenerCount`。内部 `Map<keyof Events, Set<listener>>`。
- **关键行为**：emit 时逐个 listener try/catch，异常打印 `[TypedEventEmitter] 事件处理器错误 (<event>):` 不中断其余 listener、不崩进程。
- **边界**：同一函数引用重复 on 只注册一次（Set）；无 once 语义。

### 7.14 src/scripts/uia-common.psm1（149 行）— 共享 UIA 模块

- **职责**：`Send-Json`（`[Console]::Out.WriteLine` + Flush）、`Read-StdinLine`、`Find-LiveCaptionsWindow`、`Get-CaptionText` 四个函数，`Export-ModuleMember` 显式导出。核心调用已逐字收录于 6.1。
- **要点**：`Set-StrictMode -Version Latest`、`$ErrorActionPreference = 'Stop'`、UTF-8 强制、trap→stderr fatal JSON→exit 1。

### 7.15 src/scripts/watch-window.ps1（114 行）— 窗口轮询脚本

- **职责**：`Invoke-Watch` + stdin 命令主循环，逻辑见 6.1；`Import-Module "$PSScriptRoot\uia-common.psm1"`；`#Requires -Version 5.1`。
- **边界**：默认 title `'实时字幕'`、interval 2000；Invoke-Watch 内响应 exit 后 return 回主循环（进程随后由主循环 exit 命令或 stdin 关闭检测退出）。

### 7.16 src/scripts/read-captions.ps1（124 行）— 字幕抓取脚本

- **职责**：`Invoke-Capture` + 同构主循环，逻辑见 6.1；默认 interval 500。与 watch-window.ps1 的结构差异仅在于：每轮输出 text 消息（累积全量行），窗口消失/句柄失效时发 gone 并 return。

### 7.17–7.25 src/__tests__/（9 个测试文件）

| # | 文件 | 行数 | 覆盖点 |
|---|------|------|--------|
| 7.17 | `app.test.ts` | 14 | Application 可用 defaultConfig 构造不抛；未启动时 stop() resolve |
| 7.18 | `cli.test.ts` | 114 | parseArgs 全部参数形态（含 -h/-v 短参、多参组合、空参数）；validateConfig 5 条规则 + 多错误累积 |
| 7.19 | `config.test.ts` | 42 | defaultConfig 五字段存在性、类型、非空、间隔 ≥200/≥100 且为正整数 |
| 7.20 | `config-loader.test.ts` | 58 | beforeEach 清空 5 个 LIVE_CAPTIONS_ 环境变量；默认值、env 覆盖、CLI 最高优先、sources 记录、部分覆盖合并 |
| 7.21 | `dedup.test.ts` | 70 | 6.2 表格全部 10 个边界用例 |
| 7.22 | `logger.test.ts` | 59 | info 输出含 INFO/tag/msg；verbose=false 抑制 debug；level=warn 过滤 info；error 恒出；ISO 时间戳正则 `/\d{4}-\d{2}-\d{2}T/` |
| 7.23 | `ps-process.test.ts` | 24 | 未启动态：isRunning=false、stop 立即 resolve、kill/sendCommand 不抛 |
| 7.24 | `typed-event-emitter.test.ts` | 87 | on/emit、多监听、off、removeAllListeners（指定/全部）、listenerCount、无监听 emit 不抛、监听器异常被捕获 |
| 7.25 | `writer.test.ts` | 112 | mkdtemp 隔离；目录创建、文件头唯一、二次 beginSession 加 `---`、行格式正则 `/^\d{2}:\d{2}:\d{2} \| .+字幕行/`、多次追加、文件名正则 `/字幕-\d{4}-\d{2}-\d{2}\.md$/` |

测试盲区：monitor.ts、capture.ts、index.ts、lifecycle.ts 无测试覆盖（依赖真实 PowerShell/信号，见第 10 章）。

<!-- SECTION 7 END -->

## 8. UI 与交互

无图形界面；交互全部在终端（CLI）。

**启动输出**（app.ts `printStartupInfo`，颜色码见 7.2）：

```
[启动] Live Captions → Obsidian 自动捕获工具
  Vault: C:\Users\<user>\Documents\Obsidian
  目录: notes
  窗口: "实时字幕"
[监控中] 等待实时字幕窗口 (Win+Ctrl+L)...
```

**运行期输出**：
- 窗口出现：`[检测到] 实时字幕窗口出现`（绿）→ `[捕获中] 正在记录字幕...`（绿）→ `  文件: <完整路径>`（暗淡）。
- 捕获中：`  +N 条 (共 M 条)\r`（青色，单行原地刷新）。
- 窗口关闭：`[监控中] 字幕窗口已关闭，共保存 M 条`（黄；monitor 来源的结束消息带 `(monitor)` 后缀）→ `[监控中] 继续等待实时字幕窗口...`。
- 重复 appear：`  [跳过] 已在捕获中`（暗淡）。
- 错误：`[错误] monitor: <msg>` / `[错误] capture: <msg>`（红）。
- 退出：Ctrl+C → `正在退出...`（暗淡）；SIGTERM → `收到 SIGTERM，正在退出...`；致命错误 → `[致命错误] 未捕获异常: <msg>`。

**--help 输出**：cli.ts 模板字符串（用法 / 11 个选项 / 示例，选项默认值动态取自 defaultConfig）。**--version 输出**：`live-captions-to-obsidian v1.0.0`。

不适用部分：无 TUI 框架、无进度条库、无交互式问答；`--no-color` 已解析但未生效（颜色码硬编码在 app.ts/index.ts/lifecycle.ts）。

<!-- SECTION 8 END -->

## 9. 从零复现步骤

1. **初始化工程**：新建目录，写入第 2 章逐字收录的 `package.json`、`tsconfig.json`、`vitest.config.ts`、`eslint.config.js`、`.prettierrc`、`.prettierignore`、`.gitignore`，执行 `npm install`。
   ✅ 验收：`npm ls typescript tsx vitest` 无 missing。
2. **创建数据/工具层**：按第 4 章类型定义与 7.4/7.11/7.12/7.13 实现 `src/config.ts`、`src/lib/dedup.ts`（6.2 全文逐字）、`src/lib/ps-process.ts`（spawn 参数与停止时序常量逐字）、`src/lib/typed-event-emitter.ts`。
   ✅ 验收：`npx tsc --noEmit` 通过。
3. **创建 PowerShell 层**：按 6.1 实现 `src/scripts/uia-common.psm1`（四函数 + UIA 关键调用逐字）、`watch-window.ps1`、`read-captions.ps1`（主循环/命令分派/心跳/可中断休眠/UTF-8/trap 结构一致）。
   ✅ 验收：`[System.Management.Automation.Language.Parser]::ParseFile(...)` 三文件零语法错误；手动运行 `powershell -NoProfile -File src/scripts/watch-window.ps1`，输入 `{"cmd":"watch","title":"实时字幕","interval":2000}` 能持续收到 `{"type":"status","found":...}`。
4. **创建服务层**：按 7.7/7.8/7.9 实现 `monitor.ts`、`capture.ts`、`writer.ts`（严格遵守 4.7 IPC 契约与 4.8 文件格式）。
   ✅ 验收：typecheck 通过。
5. **创建应用层**：按 7.1/7.2/7.3/7.5/7.6/7.10 实现 `index.ts`、`app.ts`、`cli.ts`、`config-loader.ts`、`logger.ts`、`lifecycle.ts`。注意保持现状快照一致性：logger.ts 实现但**不**接入主流程；index.ts **不**把 verbose/logFile/noColor 传下去。
   ✅ 验收：`npx tsx src/index.ts --help` 输出帮助；`--version` 输出 `live-captions-to-obsidian v1.0.0`；`npx tsx src/index.ts --watch 100` 报 `watchInterval 不能小于 200ms` 且退出码 1。
6. **创建测试**：按 7.17–7.25 编写 9 个测试文件（断言细节以表中正则/消息为准）。
   ✅ 验收：`npm run test` 全绿；`npm run test:coverage` 正常产出（scripts/ 与 __tests__/ 被排除）。
7. **工程验证三连**：
   ✅ `npm run typecheck` 0 错误；`npm run lint` 0 error（允许 warn，现状主要为 explicit-function-return-type 类警告）；`npm run test` 全部通过。
8. **创建启动器与 CI**：逐字写入 `launcher.ps1`（6.5）、`start-hidden.vbs`（6.5，如实保留其指向缺失 start.bat 的现状）、`.github/workflows/ci.yml`（按 2.7 要点）、`LICENSE`（MIT）、`README.md`（可参照第 1/2/4/8 章重写）。
   ✅ 验收：CI 六 job（lint/typecheck×3 Node 版本/powershell-check/test/build/audit）定义齐全；本地 pwsh 语法检查 launcher.ps1 通过。
9. **端到端验收（需 Windows 11 实机）**：运行 `npx tsx src/index.ts`，按 `Win+Ctrl+L` 打开实时字幕，播放任意音频。
   ✅ 验收：终端出现"[检测到]→[捕获中]→+N 条"；`%USERPROFILE%\Documents\Obsidian\notes\字幕-<今日>.md` 生成且格式符合 4.8；关闭字幕窗口后回到"[监控中]"；同日再次开关窗口，文件出现 `---` 分隔的第二个会话；Ctrl+C 干净退出且无残留 powershell.exe。

<!-- SECTION 9 END -->

## 10. 不可文本化资产与已知问题

### 10.1 外部依赖（不可文本化）

- **Windows 11 Live Captions**：核心数据源；窗口类名 `LiveCaptionsDesktopWindow` 属系统实现细节，微软版本更新可能变更（届时主查找路径失效，仅剩标题子串回退）。Windows 10 无此功能。
- **UIAutomationClient / UIAutomationTypes**：.NET Framework 随 Windows 提供的程序集，无法 npm 安装。
- **PowerShell 5.1**：脚本 `#Requires -Version 5.1`；Node 侧以 `powershell`（Windows PowerShell）而非 `pwsh` 启动。
- **Obsidian**：非硬依赖——输出为普通 Markdown，vault 只是目录约定，无插件、无 API 交互。

### 10.2 坑与已知问题（现状快照）

1. **start-hidden.vbs 启动链断裂**：vbs 执行 `cmd /c start.bat`，但仓库中无 start.bat（已按改造计划 Phase 7 删除而 vbs 未同步）→ `launcher.ps1` 第 1 步实际无效。修复方向：vbs 改为直接运行 `npx tsx src/index.ts` 或恢复 start.bat。
2. **launcher.ps1 SendKeys 回退不可靠**：`SendWait("^{Win}{L}")` 中 `{Win}` 不是合法 SendKeys 记号（SendKeys 不支持 Win 键），该分支必抛异常落入 keybd_event 终极回退——功能上可达，但中间层是死代码。
3. **Logger 未接线**：`--verbose`/`--log-file`/`--no-color` 解析后被丢弃；app.ts/index.ts/lifecycle.ts 仍硬编码 ANSI 颜色（app.ts 有 NOTE 注释声明属临时状态）。
4. **文本滚动重复写入**：窗口滚动裁剪头部时 LCP 骤短，已保存行会被重复写入（见 6.2 表末行）。REFACTORING-PLAN §1.5 提出的 prevTail 重叠去重分支**未合入** lib/dedup.ts。
5. **部分重写产生残行**：LCP 断点落在行中间时写入半行文本（如"新结尾"），无行级对齐处理。
6. **NaN 间隔穿透校验**：`--watch abc` → parseInt 得 NaN，`NaN < 200` 为 false，validateConfig 放行；PS 端 `[int]$parsed.interval` 转换行为随之不可控。
7. **fire-and-forget 写入**：app.ts 不 await `beginSession`/`writeLines`，磁盘错误变成 unhandledRejection（仅打印不退出）。
8. **双路 gone**：窗口关闭时 capture（gone 消息/close 兜底）与 monitor（status 边沿）都可能触发清理；`cleanupCapture` 幂等所以安全，但终端可能打印两次"字幕窗口已关闭"（其一带 `(monitor)` 标记）。
9. **dist 不可运行**：`npm run build` 产物不含 scripts/*.ps1、无 bin 字段，唯一运行方式是 tsx；CI build job 的 artifact 实用性存疑（REFACTORING-PLAN §6.4 建议移除，未执行）。
10. **测试盲区**：monitor.ts / capture.ts / index.ts / lifecycle.ts 零覆盖；ps-process.test.ts 仅测未启动态。
11. **README 漂移**：README "Data flow" 称去重用 "seen-lines set"，实际为前缀比较增量算法；`rimraf` 在 devDeps 中但无脚本使用。
12. **VERSION 双源**：cli.ts 硬编码 `"1.0.0"` 与 package.json version 需手工同步。
13. **LoggerLike 接口重复定义**：logger.ts（四方法）、monitor.ts 与 capture.ts（各自三方法内联版）三处并存。

### 10.3 引用 REFACTORING-PLAN.md 的改造方向（本文档不预设其执行）

该计划（2026-05-27 生成）与当前代码对照：

- **已落地**：Phase 1（lib 三件套接线、ps1 拆分、uia-capture.ps1 删除、goneEmitted 双 gone 修复）、Phase 2（app.ts / lifecycle.ts / 瘦身 index.ts）、Phase 3.1/3.2（resolveConfig 激活、env 变量统一 LIVE_CAPTIONS_*）、Phase 4.1（writer 异步 I/O）、Phase 5.1/5.3 部分（6 个新测试文件、@vitest/coverage-v8 依赖）、Phase 6.1/6.2/6.3（CI glob ps 检查、no-console 白名单、engines 字段）、Phase 7.1 部分（launcher.bat / start.bat 删除）。
- **未落地**：Phase 1.5（dedup prevTail 重叠分支）、Phase 3.3（Logger 注入 Application、替换 console）、Phase 4.2（启动时 vaultPath 存在性检查）、Phase 5.3 的 coverage thresholds（vitest.config.ts 无 thresholds）、Phase 6.4（build job 处置）、Phase 7.2（README 更新——仍有漂移）、Phase 7.3（launcher npm script；lint-staged 已不在 package.json 中，该项自然消解）。

<!-- SECTION 10 END -->

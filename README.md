# Live Captions to Obsidian

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=fff)
![Windows 11](https://img.shields.io/badge/Windows%2011-0078D4?style=flat&logo=windows&logoColor=fff)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat&logo=node.js&logoColor=fff)
![License MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat)

---

## 中文简介

自动捕获 Windows 11 实时字幕（Live Captions）窗口中的文字内容，并将其保存为 Obsidian 笔记。工具在后台静默运行，检测到字幕窗口出现时自动开始捕获，窗口关闭时自动停止，无需手动操作。

## English Intro

Automatically capture text from the Windows 11 Live Captions window and save it as Obsidian Markdown notes. The tool runs silently in the background -- it starts capturing the moment the Live Captions window appears and stops when it closes, with no manual intervention required.

---

## Features

- **Auto-detection / 自动检测** -- runs in the background, auto-starts when the Live Captions window appears (`Win+Ctrl+L`), auto-stops when the window is closed
- **UI Automation / 界面自动化** -- extracts text directly from the Live Captions window via Windows UI Automation (PowerShell)
- **Deduplication / 去重** -- tracks already-seen lines so only new text is written to disk
- **Daily notes / 每日笔记** -- each day gets its own file `字幕-YYYY-MM-DD.md`; multiple sessions within one day are separated by a `---` divider
- **Layered configuration / 分层配置** -- supports CLI arguments, config file (`.live-captions.json`), environment variables, and defaults
- **Zero runtime dependencies / 零运行时依赖** -- the only dependency is `tsx` for development; everything else uses Node.js built-ins and PowerShell

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Windows 11 | any | Live Captions feature must be available |
| Node.js | 18+ | for running TypeScript directly |
| PowerShell | 5.1+ | ships with Windows, no install needed |

---

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/live-captions-to-obsidian.git
cd live-captions-to-obsidian

# 2. Install dev dependencies
npm install

# 3. Run the monitor
npx tsx src/index.ts
```

The tool will wait for the Live Captions window to appear. Press `Win+Ctrl+L` to open it and capture begins automatically.

### One-click launcher

```powershell
# Starts the capture tool + opens Live Captions in one action
powershell -ExecutionPolicy Bypass -File launcher.ps1
```

---

## Usage

1. Start the tool:
   ```bash
   npx tsx src/index.ts
   ```
2. Press `Win+Ctrl+L` to open the Windows Live Captions window.
3. The tool detects the window, begins extracting text, and writes it to your Obsidian vault in real time.
4. Close the Live Captions window or press `Ctrl+C` in the terminal to stop.

```
[启动] Live Captions → Obsidian 自动捕获工具
  Vault: C:\Users\you\Documents\Obsidian
  目录: notes
  窗口: "实时字幕"
[监控中] 等待实时字幕窗口 (Win+Ctrl+L)...

[检测到] 实时字幕窗口出现
[捕获中] 正在记录字幕...
  文件: C:\Users\you\Documents\Obsidian\notes\字幕-2026-05-27.md
  +3 条 (共 8 条)
[监控中] 字幕窗口已关闭，共保存 8 条
[监控中] 继续等待实时字幕窗口...
```

---

## Configuration

All settings can be overridden via multiple sources (highest priority first):

### Priority: CLI > Config file > Environment variables > Defaults

### CLI Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--vault PATH` | `$HOME\Documents\Obsidian` | Path to your Obsidian vault |
| `--dir NAME` | `notes` | Subdirectory inside the vault for caption notes |
| `--title TITLE` | `实时字幕` | Window title to look for (match your Live Captions language setting) |
| `--watch MS` | `2000` | Window detection polling interval (ms) |
| `--capture MS` | `500` | Caption text extraction polling interval (ms) |
| `--config PATH` | auto-discovered | Path to config file |
| `--verbose, -v` | off | Enable debug logging |
| `--log-file PATH` | none | Write logs to file |
| `--no-color` | off | Disable colored output |
| `--help, -h` | | Show help |
| `--version` | | Show version |

### Config File

Create `.live-captions.json` in your project directory or home directory:

```json
{
  "vaultPath": "D:\\MyVault",
  "notesDir": "captions",
  "windowTitle": "Live Captions",
  "watchInterval": 3000,
  "captureInterval": 1000
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `LIVE_CAPTIONS_VAULT` | Override vault path |
| `LIVE_CAPTIONS_DIR` | Override notes directory |
| `LIVE_CAPTIONS_TITLE` | Override window title |
| `LIVE_CAPTIONS_WATCH_INTERVAL` | Override watch interval |
| `LIVE_CAPTIONS_CAPTURE_INTERVAL` | Override capture interval |

### Example

```bash
npx tsx src/index.ts --vault "D:\MyVault" --dir "captions" --title "Live Captions" --verbose
```

> **Note:** If your Windows display language is English, use `--title "Live Captions"` instead of the default Chinese title.

---

## Output Format

Each day produces a single Markdown file in your vault. The file name follows the pattern `字幕-YYYY-MM-DD.md`:

```markdown
# 字幕笔记 - 2026年5月27日

> 14:30:15 开始捕获

14:30:15 | 大家好，欢迎来到今天的分享
14:30:18 | 今天我们要讨论的是人工智能的发展
14:30:22 | 大语言模型正在改变我们的工作方式

---

> 15:45:02 开始捕获

15:45:02 | 下午好，我们继续刚才的话题
15:45:06 | 关于安全性和对齐问题
```

Lines are prefixed with a timestamp. Multiple capture sessions on the same day are separated by `---`.

---

## Architecture

```
              index.ts (CLI → config → bootstrap)
                       |
                       v
              +--------+--------+
              |    app.ts       |  orchestrator: event wiring, lifecycle
              +--------+--------+
                  |         |
                  v         v
          monitor.ts    capture.ts ──→ writer.ts
              |              |              |
              v              v              v
         watch-window.ps1  read-captions.ps1  Obsidian Vault
              \              |              /
               \   uia-common.psm1        /
                \     (shared)           /
                 \        |            /
                  Windows 11 Live Captions
```
```

**Data flow:**

1. `monitor.ts` polls for the Live Captions window via PowerShell (`watch-window.ps1`) at a configurable interval.
2. When the window appears, `capture.ts` invokes `read-captions.ps1` to stream caption text as JSON lines.
3. Each new line is checked against a seen-lines set; only unseen text is forwarded.
4. `writer.ts` appends timestamped lines to the daily Markdown file in the configured Obsidian vault path.

---

## Project Structure

```
src/
├── index.ts               # Entry point: CLI parsing, config resolution, bootstrap
├── app.ts                 # Application orchestrator: event wiring, lifecycle management
├── lifecycle.ts           # Signal handlers (SIGINT/SIGTERM/uncaughtException)
├── cli.ts                 # CLI argument parsing, help text, validation
├── config.ts              # Config interface and defaults
├── config-loader.ts       # Multi-source config resolution (CLI > file > env > defaults)
├── logger.ts              # Structured logger with levels, timestamps, file output
├── monitor.ts             # Window detection via PowerShell; emits appear/gone events
├── capture.ts             # PowerShell communication, JSON parsing, deduplication
├── writer.ts              # Obsidian file writing (date-based filenames, async I/O)
├── lib/
│   ├── ps-process.ts      # PowerShell subprocess lifecycle management
│   ├── typed-event-emitter.ts  # Type-safe event emitter
│   └── dedup.ts           # Text deduplication pure function
├── __tests__/
│   ├── app.test.ts
│   ├── cli.test.ts
│   ├── config.test.ts
│   ├── config-loader.test.ts
│   ├── dedup.test.ts
│   ├── logger.test.ts
│   ├── ps-process.test.ts
│   ├── typed-event-emitter.test.ts
│   └── writer.test.ts
└── scripts/
    ├── uia-common.psm1    # Shared PowerShell UIA module
    ├── watch-window.ps1   # Window existence polling
    └── read-captions.ps1  # Caption text extraction
```

---

## Development

```bash
npm run dev          # Run with auto-reload (tsx watch)
npm start            # Run once (tsx)
npm test             # Run tests (vitest)
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier format
npm run typecheck    # TypeScript type check
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change, then submit a pull request.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-change`
3. Make your changes and test on Windows 11 with Live Captions.
4. Run `npm test` and `npm run lint` before committing.
5. Commit with a clear message and push.
6. Open a pull request describing your changes.

---

## License

[MIT](LICENSE)

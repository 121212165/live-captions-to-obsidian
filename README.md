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
[monitor] Waiting for Live Captions window...
[monitor] Live Captions window detected
[capture] Session started
[capture] 3 new lines captured
[capture] 5 new lines captured
[monitor] Live Captions window closed
[capture] Session ended -- 8 lines written to 字幕-2026-05-26.md
```

---

## Configuration

The vault path defaults to `$HOME\Documents\Obsidian` and can be overridden with the `OBSIDIAN_VAULT_PATH` environment variable or the `--vault` CLI argument.

All settings can be overridden via CLI arguments:

| Argument | Default | Description |
|----------|---------|-------------|
| `--vault PATH` | `$HOME\Documents\Obsidian` (or `OBSIDIAN_VAULT_PATH` env var) | Path to your Obsidian vault |
| `--dir NAME` | `notes` | Subdirectory inside the vault for caption notes |
| `--title TITLE` | `实时字幕` | Window title to look for (match your Live Captions language setting) |

Example:

```bash
npx tsx src/index.ts --vault "D:\MyVault" --dir "captions" --title "Live Captions"
```

> **Note:** If your Windows display language is English, use `--title "Live Captions"` instead of the default Chinese title.

---

## Output Format

Each day produces a single Markdown file in your vault. The file name follows the pattern `字幕-YYYY-MM-DD.md`:

```markdown
# 字幕笔记 - 2026年5月26日

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
                   Win+Ctrl+L
                       |
                       v
              +-----------------+
              |  Windows 11     |
              |  Live Captions  |
              +--------+--------+
                       |
          UI Automation (PowerShell)
                       |
              +--------v--------+
              |   monitor.ts    |  window detection (appear / gone events)
              +--------+--------+
                       |
              +--------v--------+
              |   capture.ts    |  text extraction, JSON parsing, dedup
              +--------+--------+
                       |
              +--------v--------+
              |    writer.ts    |  Markdown formatting, file I/O
              +--------+--------+
                       |
                       v
              +-----------------+
              |   Obsidian Vault|
              | 字幕-YYYY-MM.md  |
              +-----------------+
```

**Data flow:**

1. `monitor.ts` polls for the Live Captions window via PowerShell at a configurable interval.
2. When the window appears, `capture.ts` invokes `uia-capture.ps1` in watch mode to stream caption text as JSON lines.
3. Each new line is checked against a seen-lines set; only unseen text is forwarded.
4. `writer.ts` appends timestamped lines to the daily Markdown file in the configured Obsidian vault path.

---

## Project Structure

```
src/
├── index.ts               # Entry point: CLI arg parsing, status display, graceful shutdown
├── monitor.ts             # Window detection via PowerShell; emits appear/gone events
├── capture.ts             # PowerShell communication, JSON parsing, deduplication
├── writer.ts              # Obsidian file writing (date-based filenames, timestamps)
├── config.ts              # Config types and defaults
└── scripts/
    └── uia-capture.ps1    # PowerShell UIA script (watch / capture dual modes)
```

---

## Contributing

Contributions are welcome. Please open an issue first to discuss what you would like to change, then submit a pull request.

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-change`
3. Make your changes and test on Windows 11 with Live Captions.
4. Commit with a clear message and push.
5. Open a pull request describing your changes.

---

## License

[MIT](LICENSE)

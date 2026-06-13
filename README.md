# Live Captions to Obsidian

Automatically capture text from the Windows 11 Live Captions window and save it as Obsidian Markdown notes. Runs silently in the background — starts capturing when the Live Captions window appears (`Win+Ctrl+L`), stops when it closes.

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Windows 11 | any | Live Captions feature must be available |
| Node.js | 18+ | for running TypeScript directly |
| PowerShell | 5.1+ | ships with Windows, no install needed |

## Quick Start

```bash
git clone https://github.com/<your-username>/live-captions-to-obsidian.git
cd live-captions-to-obsidian
npm install
npx tsx src/index.ts
```

The tool will wait for the Live Captions window to appear. Press `Win+Ctrl+L` to open it.

### One-click launcher

```powershell
powershell -ExecutionPolicy Bypass -File launcher.ps1
```

## Usage

1. Start: `npx tsx src/index.ts`
2. Press `Win+Ctrl+L` to open the Live Captions window.
3. The tool detects the window, extracts text, and writes to your vault in real time.
4. Close the window or press `Ctrl+C` to stop.

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

## Configuration

Edit the constants at the top of `src/index.ts`:

| Constant | Default | Description |
|----------|---------|-------------|
| `VAULT_PATH` | `~/Documents/Obsidian` | Path to your Obsidian vault |
| `NOTES_DIR` | `notes` | Subdirectory inside the vault |
| `WINDOW_TITLE` | `实时字幕` | Window title (use `"Live Captions"` for English) |
| `WATCH_INTERVAL` | `2000` | Window detection polling interval (ms) |
| `CAPTURE_INTERVAL` | `500` | Caption extraction polling interval (ms) |

## Output Format

Each day produces a single Markdown file `字幕-YYYY-MM-DD.md`:

```markdown
# 字幕笔记 - 2026年5月27日

> 14:30:15 开始捕获

14:30:15 | 大家好，欢迎来到今天的分享
14:30:18 | 今天我们要讨论的是人工智能的发展

---

> 15:45:02 开始捕获

15:45:02 | 下午好，我们继续刚才的话题
```

Multiple capture sessions on the same day are separated by `---`.

## License

[MIT](LICENSE)

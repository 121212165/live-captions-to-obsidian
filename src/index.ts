import { defaultConfig, Config } from "./config.js";
import { WindowMonitor } from "./monitor.js";
import { CaptureService } from "./capture.js";
import { ObsidianWriter } from "./writer.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

function parseArgs(): Partial<Config> {
  const args = process.argv.slice(2);
  const overrides: Partial<Config> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--vault" && args[i + 1]) overrides.vaultPath = args[++i];
    if (args[i] === "--dir" && args[i + 1]) overrides.notesDir = args[++i];
    if (args[i] === "--title" && args[i + 1]) overrides.windowTitle = args[++i];
  }
  return overrides;
}

const config: Config = { ...defaultConfig, ...parseArgs() };
let lineCount = 0;
let writer: ObsidianWriter | null = null;
let capture: CaptureService | null = null;

const monitor = new WindowMonitor(config);

monitor.on("appear", () => {
  console.log(`${GREEN}[捕获中]${RESET} 正在记录字幕...`);

  writer = new ObsidianWriter(config);
  writer.beginSession();
  console.log(`${DIM}  文件: ${writer.getFilePath()}${RESET}`);

  capture = new CaptureService(config);
  capture.on("text", (lines: string[]) => {
    lineCount += lines.length;
    writer?.writeLines(lines);
    process.stdout.write(`${CYAN}  +${lines.length}${RESET} 条 (共 ${lineCount} 条)\r`);
  });
  capture.on("gone", () => {
    console.log(`\n${YELLOW}[监控中]${RESET} 字幕窗口已关闭，共保存 ${lineCount} 条，继续等待...`);
    capture?.stop();
    capture = null;
    writer = null;
    lineCount = 0;
  });
  capture.on("error", (err: Error) => {
    console.error(`${YELLOW}[错误]${RESET} ${err.message}`);
  });
  capture.start();
});

monitor.on("gone", () => {
  // Monitor detected window gone (fallback if capture didn't catch it)
  if (capture) {
    console.log(`\n${YELLOW}[监控中]${RESET} 字幕窗口已关闭，共保存 ${lineCount} 条，继续等待...`);
    capture.stop();
    capture = null;
    writer = null;
    lineCount = 0;
  }
});

monitor.on("error", (err: Error) => {
  console.error(`${YELLOW}[错误]${RESET} ${err.message}`);
});

console.log(`${YELLOW}[启动]${RESET} Live Captions → Obsidian 自动捕获工具`);
console.log(`${DIM}  Vault: ${config.vaultPath}`);
console.log(`  目录: ${config.notesDir}`);
console.log(`  窗口: "${config.windowTitle}"${RESET}`);
console.log(`${YELLOW}[监控中]${RESET} 等待实时字幕窗口 (Win+Ctrl+L)...\n`);

monitor.start();

process.on("SIGINT", () => {
  console.log(`\n${DIM}正在退出...${RESET}`);
  capture?.stop();
  monitor.stop();
  process.exit(0);
});

import { Config } from "./config.js";
import { WindowMonitor } from "./monitor.js";
import { CaptureService } from "./capture.js";
import { ObsidianWriter } from "./writer.js";

const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const RED = "\x1b[31m";
const RESET = "\x1b[0m";

// NOTE: The color codes above are TEMPORARY. A later phase will replace them
// with structured Logger calls. For now, keep the existing output behavior.

export class Application {
  private monitor: WindowMonitor;
  private capture: CaptureService | null = null;
  private writer: ObsidianWriter | null = null;
  private isCapturing = false;
  private lineCount = 0;

  constructor(private config: Config) {
    this.monitor = new WindowMonitor(config);
  }

  start(): void {
    this.printStartupInfo();

    this.monitor.on("appear", () => {
      console.log(`${GREEN}[检测到]${RESET} 实时字幕窗口出现`);
      this.startCapture();
    });

    this.monitor.on("gone", () => {
      if (this.isCapturing) {
        console.log(
          `\n${YELLOW}[监控中]${RESET} 字幕窗口已关闭 (monitor)，共保存 ${this.lineCount} 条`,
        );
        this.cleanupCapture();
        console.log(`${YELLOW}[监控中]${RESET} 继续等待实时字幕窗口...\n`);
      }
    });

    this.monitor.on("error", (err: Error) => {
      console.error(`${RED}[错误]${RESET} monitor: ${err.message}`);
    });

    this.monitor.start();
  }

  async stop(): Promise<void> {
    await this.cleanupCapture();
    await this.monitor.stop();
  }

  private startCapture(): void {
    if (this.isCapturing) {
      console.log(`${DIM}  [跳过] 已在捕获中${RESET}`);
      return;
    }
    this.isCapturing = true;
    this.lineCount = 0;

    console.log(`${GREEN}[捕获中]${RESET} 正在记录字幕...`);
    this.writer = new ObsidianWriter(this.config);
    this.writer.beginSession();
    console.log(`${DIM}  文件: ${this.writer.getFilePath()}${RESET}`);

    this.capture = new CaptureService(this.config);

    this.capture.on("text", (lines: string[]) => {
      this.lineCount += lines.length;
      this.writer?.writeLines(lines);
      process.stdout.write(`${CYAN}  +${lines.length}${RESET} 条 (共 ${this.lineCount} 条)\r`);
    });

    this.capture.on("gone", () => {
      console.log(`\n${YELLOW}[监控中]${RESET} 字幕窗口已关闭，共保存 ${this.lineCount} 条`);
      this.cleanupCapture();
      console.log(`${YELLOW}[监控中]${RESET} 继续等待实时字幕窗口...\n`);
    });

    this.capture.on("error", (err: Error) => {
      console.error(`${RED}[错误]${RESET} capture: ${err.message}`);
    });

    this.capture.start();
  }

  private async cleanupCapture(): Promise<void> {
    if (this.capture) {
      await this.capture.stop();
      this.capture.resetDedup();
      this.capture = null;
    }
    this.writer = null;
    this.lineCount = 0;
    this.isCapturing = false;
  }

  private printStartupInfo(): void {
    console.log(`${YELLOW}[启动]${RESET} Live Captions → Obsidian 自动捕获工具`);
    console.log(`${DIM}  Vault: ${this.config.vaultPath}`);
    console.log(`  目录: ${this.config.notesDir}`);
    console.log(`  窗口: "${this.config.windowTitle}"${RESET}`);
    console.log(`${YELLOW}[监控中]${RESET} 等待实时字幕窗口 (Win+Ctrl+L)...\n`);
  }
}

import fs from "fs";
import path from "path";
import { Config } from "./config.js";

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatDisplayDate(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export class ObsidianWriter {
  private filePath: string;
  private fileCreated = false;
  private currentDate: string;
  private notesDir: string;

  constructor(config: Config) {
    this.notesDir = path.join(config.vaultPath, config.notesDir);
    fs.mkdirSync(this.notesDir, { recursive: true });
    this.currentDate = formatDate(new Date());
    this.filePath = path.join(this.notesDir, `字幕-${this.currentDate}.md`);
  }

  async beginSession(): Promise<void> {
    const now = new Date();
    const exists = await fs.promises.access(this.filePath).then(() => true).catch(() => false);

    if (!exists && !this.fileCreated) {
      const header = `# 字幕笔记 - ${formatDisplayDate(now)}\n\n`;
      await fs.promises.writeFile(this.filePath, header, "utf-8");
      this.fileCreated = true;
    } else {
      await fs.promises.appendFile(this.filePath, "\n---\n\n", "utf-8");
    }
    await fs.promises.appendFile(this.filePath, `> ${formatTime(now)} 开始捕获\n\n`, "utf-8");
  }

  async writeLines(lines: string[]): Promise<void> {
    const now = new Date();
    const today = formatDate(now);
    if (today !== this.currentDate) {
      this.currentDate = today;
      this.filePath = path.join(this.notesDir, `字幕-${today}.md`);
      this.fileCreated = false;
      await this.beginSession();
    }
    const time = formatTime(now);
    const content = lines.map((line) => `${time} | ${line}`).join("\n") + "\n";
    await fs.promises.appendFile(this.filePath, content, "utf-8");
  }

  getFilePath(): string {
    return this.filePath;
  }
}

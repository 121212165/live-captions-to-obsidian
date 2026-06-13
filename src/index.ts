import fs from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VAULT_PATH = path.join(os.homedir(), "Documents", "Obsidian");
const NOTES_DIR = "notes";
const WINDOW_TITLE = "实时字幕";
const WATCH_INTERVAL = 2000;
const CAPTURE_INTERVAL = 500;

function findLiveCaptionsWindow(): Promise<boolean> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, "scripts", "watch-window.ps1");
    const proc = spawn("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    let resolved = false;
    let buffer = "";

    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === "status" && !resolved) {
            resolved = true;
            proc.kill();
            resolve(msg.found === true);
          }
        } catch { /* ignore non-JSON */ }
      }
    });

    proc.on("error", () => { if (!resolved) { resolved = true; resolve(false); } });
    proc.on("close", () => { if (!resolved) { resolved = true; resolve(false); } });

    proc.stdin?.write(JSON.stringify({ cmd: "watch", title: WINDOW_TITLE, interval: 999999 }) + "\n");

    setTimeout(() => { if (!resolved) { resolved = true; proc.kill(); resolve(false); } }, 5000);
  });
}

async function* readCaptions(): AsyncGenerator<string[]> {
  const scriptPath = path.join(__dirname, "scripts", "read-captions.ps1");
  const proc = spawn("powershell", [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath,
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let buffer = "";
  const queue: string[][] = [];
  let done = false;
  let resolveNext: ((value: IteratorResult<string[]>) => void) | null = null;

  proc.stdout?.on("data", (data: Buffer) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === "text" && Array.isArray(msg.lines)) {
          if (resolveNext) {
            const r = resolveNext;
            resolveNext = null;
            r({ value: msg.lines, done: false });
          } else {
            queue.push(msg.lines);
          }
        } else if (msg.type === "gone") {
          done = true;
          if (resolveNext) {
            const r = resolveNext;
            resolveNext = null;
            r({ value: undefined as unknown as string[], done: true });
          }
        }
      } catch { /* ignore non-JSON */ }
    }
  });

  proc.on("close", () => {
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r({ value: undefined as unknown as string[], done: true });
    }
  });

  proc.stdin?.write(JSON.stringify({ cmd: "capture", title: WINDOW_TITLE, interval: CAPTURE_INTERVAL }) + "\n");

  try {
    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (done) {
        break;
      } else {
        const result = await new Promise<IteratorResult<string[]>>((resolve) => {
          resolveNext = resolve;
        });
        if (result.done) break;
        yield result.value;
      }
    }
  } finally {
    try { proc.stdin?.write(JSON.stringify({ cmd: "exit" }) + "\n"); } catch {}
    setTimeout(() => { try { proc.kill(); } catch {} }, 1000);
  }
}

function extractNewLines(rawLines: string[], prevText: string): { newLines: string[]; currentText: string } {
  const currentText = rawLines.join("\n");
  if (!currentText) return { newLines: [], currentText };

  let newContent: string;
  if (currentText.startsWith(prevText)) {
    newContent = currentText.substring(prevText.length);
  } else {
    let i = 0;
    while (i < currentText.length && i < prevText.length && currentText[i] === prevText[i]) {
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

function getFilePath(): string {
  const notesDir = path.join(VAULT_PATH, NOTES_DIR);
  fs.mkdirSync(notesDir, { recursive: true });
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return path.join(notesDir, `字幕-${y}-${m}-${d}.md`);
}

function formatTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function beginSession(filePath: string): void {
  const now = new Date();
  const exists = fs.existsSync(filePath);
  if (!exists) {
    const displayDate = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
    fs.writeFileSync(filePath, `# 字幕笔记 - ${displayDate}\n\n`, "utf-8");
  } else {
    fs.appendFileSync(filePath, "\n---\n\n", "utf-8");
  }
  fs.appendFileSync(filePath, `> ${formatTime(now)} 开始捕获\n\n`, "utf-8");
}

function writeLines(filePath: string, lines: string[]): void {
  const time = formatTime(new Date());
  const content = lines.map((line) => `${time} | ${line}`).join("\n") + "\n";
  fs.appendFileSync(filePath, content, "utf-8");
}

async function main(): Promise<void> {
  console.log(`\x1b[33m[启动]\x1b[0m Live Captions → Obsidian 自动捕获工具`);
  console.log(`\x1b[2m  Vault: ${VAULT_PATH}`);
  console.log(`  目录: ${NOTES_DIR}`);
  console.log(`  窗口: "${WINDOW_TITLE}"\x1b[0m`);

  while (true) {
    console.log(`\x1b[33m[监控中]\x1b[0m 等待实时字幕窗口 (Win+Ctrl+L)...`);
    const found = await findLiveCaptionsWindow();
    if (!found) {
      await new Promise((r) => setTimeout(r, WATCH_INTERVAL));
      continue;
    }

    console.log(`\x1b[32m[检测到]\x1b[0m 实时字幕窗口出现`);
    const filePath = getFilePath();
    beginSession(filePath);
    console.log(`\x1b[32m[捕获中]\x1b[0m 正在记录字幕...`);
    console.log(`\x1b[2m  文件: ${filePath}\x1b[0m`);

    let prevText = "";
    let lineCount = 0;

    for await (const lines of readCaptions()) {
      const { newLines, currentText } = extractNewLines(lines, prevText);
      prevText = currentText;
      if (newLines.length > 0) {
        lineCount += newLines.length;
        writeLines(filePath, newLines);
        process.stdout.write(`\x1b[36m  +${newLines.length}\x1b[0m 条 (共 ${lineCount} 条)\r`);
      }
    }

    console.log(`\n\x1b[33m[监控中]\x1b[0m 字幕窗口已关闭，共保存 ${lineCount} 条`);
    console.log(`\x1b[33m[监控中]\x1b[0m 继续等待实时字幕窗口...\n`);
  }
}

process.on("SIGINT", () => {
  console.log(`\n\x1b[2m正在退出...\x1b[0m`);
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(`\n\x1b[2m收到 SIGTERM，正在退出...\x1b[0m`);
  process.exit(0);
});

process.on("uncaughtException", (err) => {
  console.error(`\x1b[31m[致命错误]\x1b[0m 未捕获异常: ${err.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`\x1b[31m[致命错误]\x1b[0m 未处理的 Promise 拒绝: ${reason}`);
});

main().catch(console.error);

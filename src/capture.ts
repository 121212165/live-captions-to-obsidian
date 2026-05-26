import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CaptureEvents {
  text: (lines: string[]) => void;
  gone: () => void;
  error: (err: Error) => void;
}

export class CaptureService extends EventEmitter {
  private process: ChildProcess | null = null;
  private prevText = "";
  private scriptPath: string;

  constructor(private config: Config) {
    super();
    this.scriptPath = path.join(__dirname, "scripts", "uia-capture.ps1");
  }

  /**
   * Extract truly new content from accumulated text.
   * Live Captions returns a single growing text block per poll.
   * We compare against the previous full text to find only the delta.
   */
  private extractNewLines(rawLines: string[]): string[] {
    const currentText = rawLines.join("\n");
    if (!currentText) return [];

    let newContent: string;
    if (currentText.startsWith(this.prevText)) {
      // Normal case: text grew by appending
      newContent = currentText.substring(this.prevText.length);
    } else {
      // Text was rewritten — find longest common prefix
      let i = 0;
      while (i < currentText.length && i < this.prevText.length && currentText[i] === this.prevText[i]) {
        i++;
      }
      newContent = currentText.substring(i);
      // Deduplicate: if the new content overlaps with the tail of prevText, take only the non-overlapping suffix
      const prevTail = this.prevText.substring(i);
      if (prevTail && newContent.startsWith(prevTail)) {
        newContent = newContent.substring(prevTail.length);
      }
    }
    this.prevText = currentText;

    if (!newContent.trim()) return [];
    return newContent.split("\n").filter((l) => l.trim().length > 0);
  }

  start(): void {
    this.prevText = "";
    this.process = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", this.scriptPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    // Send capture command
    const cmd = JSON.stringify({
      cmd: "capture",
      title: this.config.windowTitle,
      interval: this.config.captureInterval,
    }) + "\n";
    this.process.stdin?.write(cmd);

    // Drain stderr to prevent process blocking
    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[capture:stderr] ${msg}`);
    });

    let buffer = "";
    this.process.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === "text" && Array.isArray(msg.lines)) {
            const newLines = this.extractNewLines(msg.lines);
            if (newLines.length > 0) {
              this.emit("text", newLines);
            }
          } else if (msg.type === "gone") {
            this.emit("gone");
          }
        } catch (e) { console.debug("[capture] ignoring non-JSON line:", e); }
      }
    });

    this.process.on("error", (err) => this.emit("error", err));
    this.process.on("close", () => this.emit("gone"));
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.stdin?.write(JSON.stringify({ cmd: "exit" }) + "\n");
        setTimeout(() => this.process?.kill(), 500);
      } catch (e) { console.error("[capture] failed to send exit, force killing:", e); this.process.kill(); }
      this.process = null;
    }
    this.prevText = "";
  }

  resetDedup(): void {
    this.prevText = "";
  }
}

import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CaptureEvents {
  newText: (lines: string[]) => void;
  gone: () => void;
  error: (err: Error) => void;
}

export class CaptureService extends EventEmitter {
  private process: ChildProcess | null = null;
  private seenLines = new Set<string>();
  private scriptPath: string;

  constructor(private config: Config) {
    super();
    this.scriptPath = path.join(__dirname, "scripts", "uia-capture.ps1");
  }

  start(): void {
    this.seenLines.clear();
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
            const newLines = msg.lines.filter((l: string) => !this.seenLines.has(l));
            for (const l of newLines) this.seenLines.add(l);
            if (newLines.length > 0) {
              this.emit("text", newLines);
            }
          } else if (msg.type === "gone") {
            this.emit("gone");
          }
        } catch { /* ignore non-JSON lines */ }
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
      } catch { this.process.kill(); }
      this.process = null;
    }
    this.seenLines.clear();
  }

  resetDedup(): void {
    this.seenLines.clear();
  }
}

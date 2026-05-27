import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import path from "path";
import { fileURLToPath } from "url";
import { Config } from "./config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface MonitorEvents {
  appear: () => void;
  gone: () => void;
  error: (err: Error) => void;
}

export class WindowMonitor extends EventEmitter {
  private process: ChildProcess | null = null;
  private scriptPath: string;

  constructor(private config: Config) {
    super();
    this.scriptPath = path.join(__dirname, "scripts", "uia-capture.ps1");
  }

  start(): void {
    this.process = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", this.scriptPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    // Send watch command
    const cmd = JSON.stringify({
      cmd: "watch",
      title: this.config.windowTitle,
      interval: this.config.watchInterval,
    }) + "\n";
    this.process.stdin?.write(cmd);

    // Drain stderr to prevent process blocking
    this.process.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[monitor:stderr] ${msg}`);
    });

    let wasFound = false;
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
          if (msg.type === "status") {
            const found = msg.found === true;
            if (found && !wasFound) {
              this.emit("appear");
            } else if (!found && wasFound) {
              this.emit("gone");
            }
            wasFound = found;
          }
        } catch (e) { console.debug("[monitor] ignoring non-JSON line:", e); }
      }
    });

    this.process.on("error", (err) => this.emit("error", err));
    this.process.on("close", (code) => {
      if (code !== 0) {
        console.error(`[monitor] 进程异常退出 code=${code}`);
      }
      if (wasFound) {
        this.emit("gone");
        wasFound = false;
      }
    });
  }

  stop(): void {
    if (this.process) {
      try {
        this.process.stdin?.write(JSON.stringify({ cmd: "exit" }) + "\n");
        setTimeout(() => {
          try { this.process?.kill(); } catch (e) { console.error("[monitor] failed to kill process after exit command:", e); }
        }, 500);
      } catch {
        try { this.process.kill(); } catch (e) { console.error("[monitor] failed to force-kill process:", e); }
      }
      this.process = null;
    }
  }
}

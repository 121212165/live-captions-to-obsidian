import { spawn, ChildProcess } from "child_process";

export interface PsProcessOptions {
  scriptPath: string;
  onMessage: (msg: unknown) => void;
  onError: (err: Error) => void;
  onClose: (code: number | null) => void;
  onStderr?: (line: string) => void;
}

const CLEANUP_KILL_TIMEOUT_MS = 3000;
const CLEANUP_FORCE_KILL_TIMEOUT_MS = 2000;

export class PsProcess {
  private proc: ChildProcess | null = null;

  get isRunning(): boolean {
    return this.proc !== null && !this.proc.killed;
  }

  start(options: PsProcessOptions): void {
    this.proc = spawn("powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      options.scriptPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    // Drain stderr
    this.proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        options.onStderr?.(msg);
      }
    });

    // Parse stdout JSON lines
    let buffer = "";
    this.proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          options.onMessage(JSON.parse(trimmed));
        } catch {
          // non-JSON line, ignore
        }
      }
    });

    this.proc.on("error", (err) => options.onError(err));
    this.proc.on("close", (code) => options.onClose(code));
  }

  sendCommand(cmd: object): void {
    if (!this.proc?.stdin) return;
    try {
      this.proc.stdin.write(JSON.stringify(cmd) + "\n");
    } catch {
      // stdin may be closed
    }
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.proc) return resolve();

      const proc = this.proc;

      const forceKillTimer = setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* process may already be dead */ }
        resolve();
      }, CLEANUP_KILL_TIMEOUT_MS + CLEANUP_FORCE_KILL_TIMEOUT_MS);

      proc.on("close", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });

      // Graceful: send exit command
      try {
        proc.stdin?.write(JSON.stringify({ cmd: "exit" }) + "\n");
      } catch {
        clearTimeout(forceKillTimer);
        try { proc.kill(); } catch { /* process already terminated */ }
        resolve();
      }

      // Force kill after timeout
      setTimeout(() => {
        try { proc.kill("SIGTERM"); } catch { /* process may have exited */ }
      }, CLEANUP_KILL_TIMEOUT_MS);
    });
  }

  kill(): void {
    if (this.proc) {
      try { this.proc.kill(); } catch { /* already dead */ }
      this.proc = null;
    }
  }
}

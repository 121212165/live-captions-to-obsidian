import path from "path";
import { fileURLToPath } from "url";
import { Config } from "./config.js";
import { PsProcess } from "./lib/ps-process.js";
import { TypedEventEmitter } from "./lib/typed-event-emitter.js";
import { extractNewLines } from "./lib/dedup.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface LoggerLike {
  info(tag: string, message: string): void;
  error(tag: string, message: string): void;
  debug(tag: string, message: string): void;
}

const TAG = "capture";

export interface CaptureEvents {
  text: [lines: string[]];
  gone: [];
  error: [err: Error];
  [key: string]: unknown[];
}

export class CaptureService extends TypedEventEmitter<CaptureEvents> {
  private psProcess: PsProcess | null = null;
  private prevText = "";
  private goneEmitted = false;
  private scriptPath: string;
  private logger: LoggerLike;

  constructor(
    private config: Config,
    logger?: LoggerLike,
  ) {
    super();
    this.scriptPath = path.join(__dirname, "scripts", "read-captions.ps1");
    this.logger = logger ?? {
      info: (_t, m) => console.log(`[INFO] ${m}`),
      error: (_t, m) => console.error(`[ERROR] ${m}`),
      debug: (_t, m) => console.debug(`[DEBUG] ${m}`),
    };
  }

  start(): void {
    this.prevText = "";
    this.goneEmitted = false;

    this.psProcess = new PsProcess();

    this.psProcess.start({
      scriptPath: this.scriptPath,
      onMessage: (msg: unknown) => {
        const parsed = msg as { type: string; lines?: string[] };
        if (parsed.type === "text" && Array.isArray(parsed.lines)) {
          const result = extractNewLines(parsed.lines, this.prevText);
          this.prevText = result.currentText;
          if (result.newLines.length > 0) {
            this.emit("text", result.newLines);
          }
        } else if (parsed.type === "gone") {
          this.goneEmitted = true;
          this.emit("gone");
        } else if (parsed.type === "heartbeat") {
          this.logger.debug(TAG, "heartbeat received");
        }
      },
      onError: (err: Error) => {
        this.emit("error", err);
      },
      onClose: (code: number | null) => {
        if (code !== 0) {
          this.logger.error(TAG, `进程异常退出 code=${code}`);
        }
        if (!this.goneEmitted) {
          this.goneEmitted = true;
          this.emit("gone");
        }
      },
    });

    this.psProcess.sendCommand({
      cmd: "capture",
      title: this.config.windowTitle,
      interval: this.config.captureInterval,
    });
  }

  async stop(): Promise<void> {
    if (this.psProcess) {
      await this.psProcess.stop();
      this.psProcess = null;
    }
    this.prevText = "";
  }

  resetDedup(): void {
    this.prevText = "";
    this.goneEmitted = false;
  }
}

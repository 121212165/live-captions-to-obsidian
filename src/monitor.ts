import path from "path";
import { fileURLToPath } from "url";
import { Config } from "./config.js";
import { PsProcess } from "./lib/ps-process.js";
import { TypedEventEmitter } from "./lib/typed-event-emitter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type MonitorEvents = {
  appear: [];
  gone: [];
  error: [Error];
};

export interface LoggerLike {
  info(tag: string, message: string): void;
  error(tag: string, message: string): void;
  debug(tag: string, message: string): void;
}

export class WindowMonitor extends TypedEventEmitter<MonitorEvents> {
  private psProcess: PsProcess | null = null;
  private readonly scriptPath: string;
  private readonly logger: LoggerLike;

  constructor(
    private readonly config: Config,
    logger?: LoggerLike,
  ) {
    super();
    this.scriptPath = path.join(__dirname, "scripts", "watch-window.ps1");
    this.logger = logger ?? {
      info: (_tag, message) => console.log(`[monitor] ${message}`),
      error: (_tag, message) => console.error(`[monitor] ${message}`),
      debug: (_tag, message) => console.debug(`[monitor] ${message}`),
    };
  }

  start(): void {
    this.psProcess = new PsProcess();

    let wasFound = false;

    this.psProcess.start({
      scriptPath: this.scriptPath,
      onMessage: (msg: unknown) => {
        const record = msg as Record<string, unknown>;

        if (record.type === "status") {
          const found = record.found === true;
          if (found && !wasFound) {
            this.emit("appear");
          } else if (!found && wasFound) {
            this.emit("gone");
          }
          wasFound = found;
        } else if (record.type === "heartbeat") {
          this.logger.debug("[monitor]", "heartbeat received");
        }
      },
      onError: (err: Error) => {
        this.emit("error", err);
      },
      onClose: (code: number | null) => {
        if (code !== 0) {
          this.logger.error("[monitor]", `process exited with code=${code}`);
        }
        if (wasFound) {
          this.emit("gone");
          wasFound = false;
        }
      },
      onStderr: (line: string) => {
        this.logger.error("[monitor:stderr]", line);
      },
    });

    this.psProcess.sendCommand({
      cmd: "watch",
      title: this.config.windowTitle,
      interval: this.config.watchInterval,
    });
  }

  async stop(): Promise<void> {
    if (this.psProcess) {
      await this.psProcess.stop();
      this.psProcess = null;
    }
  }
}

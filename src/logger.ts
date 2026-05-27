import fs from "fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[2m",
  info: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
};

const LEVEL_TAGS: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export interface LoggerOptions {
  level: LogLevel;
  verbose: boolean;
  logFile?: string;
  noColor: boolean;
}

export class Logger {
  private stream?: fs.WriteStream;

  constructor(private options: LoggerOptions) {
    if (options.logFile) {
      this.stream = fs.createWriteStream(options.logFile, { flags: "a" });
    }
  }

  private log(level: LogLevel, tag: string, message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.options.level]) return;
    if (level === "debug" && !this.options.verbose) return;

    const timestamp = new Date().toISOString();
    const color = this.options.noColor ? "" : LEVEL_COLORS[level];
    const reset = this.options.noColor ? "" : "\x1b[0m";

    // 终端输出（带颜色）
    const formatted = `${color}[${timestamp}] [${LEVEL_TAGS[level]}] [${tag}] ${message}${reset}`;
    console.log(formatted, ...args);

    // 文件输出（纯文本）
    if (this.stream) {
      const plain = `[${timestamp}] [${LEVEL_TAGS[level]}] [${tag}] ${message} ${args.map((a) => JSON.stringify(a)).join(" ")}\n`;
      this.stream.write(plain);
    }
  }

  info(tag: string, message: string, ...args: unknown[]): void {
    this.log("info", tag, message, ...args);
  }

  warn(tag: string, message: string, ...args: unknown[]): void {
    this.log("warn", tag, message, ...args);
  }

  error(tag: string, message: string, ...args: unknown[]): void {
    this.log("error", tag, message, ...args);
  }

  debug(tag: string, message: string, ...args: unknown[]): void {
    this.log("debug", tag, message, ...args);
  }

  destroy(): void {
    this.stream?.end();
    this.stream = undefined;
  }
}

export interface LoggerLike {
  info(tag: string, message: string): void;
  error(tag: string, message: string): void;
  debug(tag: string, message: string): void;
  warn(tag: string, message: string): void;
}

// 默认 logger 实例（无配置 fallback）
let defaultLogger: Logger | null = null;

export function getLogger(options?: Partial<LoggerOptions>): Logger {
  if (!defaultLogger || options) {
    defaultLogger = new Logger({
      level: "info",
      verbose: false,
      noColor: false,
      ...options,
    });
  }
  return defaultLogger;
}

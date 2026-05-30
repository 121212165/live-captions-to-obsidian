import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Logger, getLogger } from "../logger.js";

describe("Logger", () => {
  it("logs info messages", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true });
    logger.info("test", "hello");
    expect(spy).toHaveBeenCalledOnce();
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toContain("INFO");
    expect(output).toContain("test");
    expect(output).toContain("hello");
    spy.mockRestore();
  });

  it("does not log debug when verbose is false", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true });
    logger.debug("test", "hidden");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs debug when verbose is true", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "debug", verbose: true, noColor: true });
    logger.debug("test", "visible");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("respects log level filtering", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "warn", verbose: false, noColor: true });
    logger.info("test", "filtered out");
    expect(spy).not.toHaveBeenCalled();
    logger.warn("test", "shown");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("logs error messages at all levels", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "error", verbose: false, noColor: true });
    logger.error("test", "critical");
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it("includes timestamp in output", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true });
    logger.info("test", "msg");
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toMatch(/\d{4}-\d{2}-\d{2}T/); // ISO timestamp
    spy.mockRestore();
  });

  it("writes to log file when logFile is set", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "logger-test-"));
    const logPath = join(tmp, "test.log");
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true, logFile: logPath });
    logger.info("tag", "file-logged message");
    logger.destroy();
    // Wait for stream to finish writing
    await new Promise((r) => setTimeout(r, 200));
    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("file-logged message");
    expect(content).toContain("[INFO]");
    expect(content).toContain("[tag]");
    spy.mockRestore();
    try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows file lock */ }
  });

  it("destroy closes the log file stream and can be called twice", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true });
    // Without a logFile, destroy is a no-op on the stream
    logger.destroy();
    // Calling destroy again should not throw
    logger.destroy();
    spy.mockRestore();
  });

  it("outputs color codes when noColor is false", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: false });
    logger.info("test", "colored");
    const output = spy.mock.calls[0]?.[0] as string;
    expect(output).toContain("\x1b[");
    spy.mockRestore();
  });

  it("passes extra args to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const logger = new Logger({ level: "info", verbose: false, noColor: true });
    logger.info("test", "msg", { extra: 1 });
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0]?.length).toBeGreaterThan(1);
    spy.mockRestore();
  });
});

describe("getLogger", () => {
  afterEach(() => {
    // Reset the default logger singleton by creating a new one
    getLogger({ level: "info", verbose: false, noColor: false });
  });

  it("returns a Logger instance", () => {
    const logger = getLogger();
    expect(logger).toBeInstanceOf(Logger);
  });

  it("returns the same instance on subsequent calls without options", () => {
    const logger1 = getLogger({ level: "warn", verbose: false, noColor: true });
    const logger2 = getLogger();
    expect(logger2).toBe(logger1);
  });

  it("creates a new instance when options are provided", () => {
    const logger1 = getLogger({ level: "info", verbose: false, noColor: true });
    const logger2 = getLogger({ level: "debug", verbose: true, noColor: false });
    expect(logger2).not.toBe(logger1);
  });
});

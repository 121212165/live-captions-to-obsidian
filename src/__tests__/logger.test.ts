import { describe, it, expect, vi } from "vitest";
import { Logger } from "../logger.js";

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
});

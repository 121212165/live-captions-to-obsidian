import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerLifecycle } from "../lifecycle.js";

describe("registerLifecycle", () => {
  const originalExit = process.exit;
  const originalOn = process.on;
  let handlers: Map<string, (...args: unknown[]) => void>;

  beforeEach(() => {
    handlers = new Map();
    process.exit = vi.fn() as never;
    process.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return process;
    }) as never;
  });

  afterEach(() => {
    process.exit = originalExit;
    process.on = originalOn;
  });

  it("registers SIGINT, SIGTERM, uncaughtException, and unhandledRejection handlers", () => {
    const app = { stop: vi.fn().mockResolvedValue(undefined) };
    registerLifecycle(app);

    expect(process.on).toHaveBeenCalledWith("SIGINT", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(process.on).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
  });

  it("SIGINT handler calls app.stop and exits with 0", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = { stop: vi.fn().mockResolvedValue(undefined) };
    registerLifecycle(app);

    const sigintHandler = handlers.get("SIGINT");
    expect(sigintHandler).toBeDefined();
    await sigintHandler!();

    expect(app.stop).toHaveBeenCalledOnce();
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  it("SIGTERM handler calls app.stop and exits with 0", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = { stop: vi.fn().mockResolvedValue(undefined) };
    registerLifecycle(app);

    const sigtermHandler = handlers.get("SIGTERM");
    expect(sigtermHandler).toBeDefined();
    await sigtermHandler!();

    expect(app.stop).toHaveBeenCalledOnce();
    expect(process.exit).toHaveBeenCalledWith(0);
    spy.mockRestore();
  });

  it("uncaughtException handler calls app.stop and exits with 1", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = { stop: vi.fn().mockResolvedValue(undefined) };
    registerLifecycle(app);

    const handler = handlers.get("uncaughtException");
    expect(handler).toBeDefined();
    await handler!(new Error("test crash"));

    expect(app.stop).toHaveBeenCalledOnce();
    expect(process.exit).toHaveBeenCalledWith(1);
    spy.mockRestore();
  });

  it("unhandledRejection handler logs the reason", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = { stop: vi.fn().mockResolvedValue(undefined) };
    registerLifecycle(app);

    const handler = handlers.get("unhandledRejection");
    expect(handler).toBeDefined();
    handler!("some rejection reason");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("some rejection reason"));
    spy.mockRestore();
  });
});

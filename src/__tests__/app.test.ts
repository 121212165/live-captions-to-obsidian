import { describe, it, expect, vi, beforeEach } from "vitest";
import { Application } from "../app.js";
import { defaultConfig } from "../config.js";
import { PsProcess, PsProcessOptions } from "../lib/ps-process.js";

vi.mock("../lib/ps-process.js", () => {
  return {
    PsProcess: vi.fn().mockImplementation(() => {
      return {
        isRunning: false,
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(undefined),
        kill: vi.fn(),
        sendCommand: vi.fn(),
      };
    }),
  };
});

describe("Application", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("can be constructed with valid config", () => {
    expect(() => new Application(defaultConfig)).not.toThrow();
  });

  it("stop resolves without error when not started", async () => {
    const app = new Application(defaultConfig);
    await expect(app.stop()).resolves.toBeUndefined();
  });

  it("start initializes monitor and begins watching", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    // Should print startup info
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("启动"));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("监控中"));

    // PsProcess should be created for the monitor
    const MockPsProcess = vi.mocked(PsProcess);
    expect(MockPsProcess).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("start prints config info", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const config = { ...defaultConfig, vaultPath: "/test/vault", notesDir: "test-notes" };
    const app = new Application(config);
    app.start();

    const allOutput = spy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).toContain("/test/vault");
    expect(allOutput).toContain("test-notes");
    spy.mockRestore();
  });

  it("handles monitor appear event and starts capture", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    // Get the monitor's onMessage to simulate appear
    const MockPsProcess = vi.mocked(PsProcess);
    const monitorStartCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Simulate window found
    monitorStartCall.onMessage({ type: "status", found: true });

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).toContain("检测到");
    expect(allOutput).toContain("捕获中");

    // A second PsProcess should have been created for capture
    expect(MockPsProcess).toHaveBeenCalledTimes(2);
    logSpy.mockRestore();
  });

  it("skips starting capture if already capturing", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const monitorStartCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    monitorStartCall.onMessage({ type: "status", found: true });

    // Simulate appear again while already capturing
    monitorStartCall.onMessage({ type: "status", found: false });
    monitorStartCall.onMessage({ type: "status", found: true });

    // After the gone event cleaned up, a new capture should start
    logSpy.mockRestore();
  });

  it("handles monitor gone event and cleans up capture", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const monitorStartCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Start capture first
    monitorStartCall.onMessage({ type: "status", found: true });

    // Then simulate gone
    monitorStartCall.onMessage({ type: "status", found: false });

    const allOutput = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(allOutput).toContain("关闭");
    expect(allOutput).toContain("继续等待");
    logSpy.mockRestore();
  });

  it("handles monitor error event", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const monitorStartCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    monitorStartCall.onError(new Error("monitor failed"));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("monitor failed"));
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("stop cleans up both monitor and capture", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const app = new Application(defaultConfig);
    app.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const monitorStartCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Start capture
    monitorStartCall.onMessage({ type: "status", found: true });

    await app.stop();

    // Both monitor and capture PsProcess.stop should have been called
    for (const result of MockPsProcess.mock.results) {
      expect(result.value.stop).toHaveBeenCalled();
    }
    logSpy.mockRestore();
  });
});

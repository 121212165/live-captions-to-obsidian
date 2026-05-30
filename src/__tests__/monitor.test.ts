import { describe, it, expect, vi, beforeEach } from "vitest";
import { WindowMonitor } from "../monitor.js";
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

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe("WindowMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("can be constructed with config and logger", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    expect(monitor).toBeDefined();
  });

  it("start creates a PsProcess and sends watch command", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    expect(MockPsProcess).toHaveBeenCalledOnce();
    const instance = MockPsProcess.mock.results[0]?.value;
    expect(instance.start).toHaveBeenCalledOnce();
    expect(instance.sendCommand).toHaveBeenCalledWith({
      cmd: "watch",
      title: defaultConfig.windowTitle,
      interval: defaultConfig.watchInterval,
    });
  });

  it("emits 'appear' when window is first found", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const appearHandler = vi.fn();
    monitor.on("appear", appearHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: true });
    expect(appearHandler).toHaveBeenCalledOnce();
  });

  it("emits 'gone' when window disappears after being found", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    monitor.on("gone", goneHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: true });
    startCall.onMessage({ type: "status", found: false });
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("does not emit 'appear' on repeated found=true", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const appearHandler = vi.fn();
    monitor.on("appear", appearHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: true });
    startCall.onMessage({ type: "status", found: true });
    expect(appearHandler).toHaveBeenCalledOnce();
  });

  it("does not emit 'gone' when window was never found", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    monitor.on("gone", goneHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: false });
    expect(goneHandler).not.toHaveBeenCalled();
  });

  it("handles heartbeat messages via logger", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "heartbeat" });
    expect(mockLogger.debug).toHaveBeenCalledWith("[monitor]", "heartbeat received");
  });

  it("emits 'error' on process error", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const errorHandler = vi.fn();
    monitor.on("error", errorHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    const err = new Error("process error");
    startCall.onError(err);
    expect(errorHandler).toHaveBeenCalledWith(err);
  });

  it("emits 'gone' on close when window was found", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    monitor.on("gone", goneHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: true });
    startCall.onClose(0);
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("does not emit 'gone' on close when window was not found", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    monitor.on("gone", goneHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onClose(0);
    expect(goneHandler).not.toHaveBeenCalled();
  });

  it("logs error on non-zero exit code", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onClose(1);
    expect(mockLogger.error).toHaveBeenCalledWith("[monitor]", expect.stringContaining("code=1"));
  });

  it("forwards stderr to logger", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onStderr?.("some stderr output");
    expect(mockLogger.error).toHaveBeenCalledWith("[monitor:stderr]", "some stderr output");
  });

  it("stop calls psProcess.stop", async () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    monitor.start();
    await monitor.stop();

    const MockPsProcess = vi.mocked(PsProcess);
    const instance = MockPsProcess.mock.results[0]?.value;
    expect(instance.stop).toHaveBeenCalledOnce();
  });

  it("stop resolves when not started", async () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    await expect(monitor.stop()).resolves.toBeUndefined();
  });

  it("uses default logger when none provided", () => {
    const monitor = new WindowMonitor(defaultConfig);
    expect(monitor).toBeDefined();
  });

  it("window re-appear after gone emits appear again", () => {
    const monitor = new WindowMonitor(defaultConfig, mockLogger);
    const appearHandler = vi.fn();
    const goneHandler = vi.fn();
    monitor.on("appear", appearHandler);
    monitor.on("gone", goneHandler);
    monitor.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "status", found: true });
    startCall.onMessage({ type: "status", found: false });
    startCall.onMessage({ type: "status", found: true });
    expect(appearHandler).toHaveBeenCalledTimes(2);
    expect(goneHandler).toHaveBeenCalledOnce();
  });
});

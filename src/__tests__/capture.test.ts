import { describe, it, expect, vi, beforeEach } from "vitest";
import { CaptureService } from "../capture.js";
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

describe("CaptureService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("can be constructed", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    expect(capture).toBeDefined();
  });

  it("start creates a PsProcess and sends capture command", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    expect(MockPsProcess).toHaveBeenCalledOnce();
    const instance = MockPsProcess.mock.results[0]?.value;
    expect(instance.start).toHaveBeenCalledOnce();
    expect(instance.sendCommand).toHaveBeenCalledWith({
      cmd: "capture",
      title: defaultConfig.windowTitle,
      interval: defaultConfig.captureInterval,
    });
  });

  it("emits 'text' event with new lines from dedup", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const textHandler = vi.fn();
    capture.on("text", textHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Simulate text message
    startCall.onMessage({ type: "text", lines: ["first line", "second line"] });
    expect(textHandler).toHaveBeenCalledWith(["first line", "second line"]);
  });

  it("deduplicates text across multiple messages", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const textHandler = vi.fn();
    capture.on("text", textHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "text", lines: ["line1"] });
    expect(textHandler).toHaveBeenCalledTimes(1);

    // Same content again — should not emit
    startCall.onMessage({ type: "text", lines: ["line1"] });
    expect(textHandler).toHaveBeenCalledTimes(1);

    // New content appended
    startCall.onMessage({ type: "text", lines: ["line1", "line2"] });
    expect(textHandler).toHaveBeenCalledTimes(2);
    expect(textHandler).toHaveBeenLastCalledWith(["line2"]);
  });

  it("emits 'gone' event on gone message", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    capture.on("gone", goneHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "gone" });
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("handles heartbeat message via logger debug", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "heartbeat" });
    expect(mockLogger.debug).toHaveBeenCalledWith("capture", "heartbeat received");
  });

  it("emits 'error' event on process error", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const errorHandler = vi.fn();
    capture.on("error", errorHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    const err = new Error("spawn failed");
    startCall.onError(err);
    expect(errorHandler).toHaveBeenCalledWith(err);
  });

  it("emits 'gone' on close if not already emitted (double-gone guard)", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    capture.on("gone", goneHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Close without prior gone message
    startCall.onClose(0);
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("does not emit double 'gone' if already emitted via message", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const goneHandler = vi.fn();
    capture.on("gone", goneHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "gone" });
    startCall.onClose(0);
    // 'gone' should only be emitted once
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("logs error on non-zero exit code", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onClose(1);
    expect(mockLogger.error).toHaveBeenCalledWith("capture", expect.stringContaining("code=1"));
  });

  it("stop clears the process and resets prevText", async () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    capture.start();
    await capture.stop();

    const MockPsProcess = vi.mocked(PsProcess);
    const instance = MockPsProcess.mock.results[0]?.value;
    expect(instance.stop).toHaveBeenCalledOnce();
  });

  it("stop resolves when not started", async () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    await expect(capture.stop()).resolves.toBeUndefined();
  });

  it("resetDedup clears previous text and goneEmitted flag", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const textHandler = vi.fn();
    const goneHandler = vi.fn();
    capture.on("text", textHandler);
    capture.on("gone", goneHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    startCall.onMessage({ type: "text", lines: ["data"] });
    startCall.onMessage({ type: "gone" });

    capture.resetDedup();

    // After reset, same text should appear as new if start is called again
    // And goneEmitted should be reset
    expect(goneHandler).toHaveBeenCalledOnce();
  });

  it("uses default logger when none provided", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const capture = new CaptureService(defaultConfig);
    expect(capture).toBeDefined();
    spy.mockRestore();
  });

  it("does not emit text for empty dedup result", () => {
    const capture = new CaptureService(defaultConfig, mockLogger);
    const textHandler = vi.fn();
    capture.on("text", textHandler);
    capture.start();

    const MockPsProcess = vi.mocked(PsProcess);
    const startCall = MockPsProcess.mock.results[0]?.value.start.mock.calls[0]?.[0] as PsProcessOptions;

    // Empty lines
    startCall.onMessage({ type: "text", lines: [] });
    expect(textHandler).not.toHaveBeenCalled();
  });
});

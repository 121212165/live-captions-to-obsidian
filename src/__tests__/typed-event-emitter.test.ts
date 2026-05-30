import { describe, it, expect, vi } from "vitest";
import { TypedEventEmitter } from "../lib/typed-event-emitter.js";

interface TestEvents {
  hello: [string];
  count: [number];
  empty: [];
}

describe("TypedEventEmitter", () => {
  it("calls listener when event is emitted", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();
    emitter.on("hello", handler);
    emitter.emit("hello", "world");
    expect(handler).toHaveBeenCalledWith("world");
  });

  it("supports multiple listeners", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("hello", h1);
    emitter.on("hello", h2);
    emitter.emit("hello", "test");
    expect(h1).toHaveBeenCalledWith("test");
    expect(h2).toHaveBeenCalledWith("test");
  });

  it("removes listener with off", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const handler = vi.fn();
    emitter.on("hello", handler);
    emitter.off("hello", handler);
    emitter.emit("hello", "gone");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removeAllListeners clears specific event", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("hello", h1);
    emitter.on("count", h2);
    emitter.removeAllListeners("hello");
    emitter.emit("hello", "test");
    emitter.emit("count", 42);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledWith(42);
  });

  it("removeAllListeners without arg clears all", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const h1 = vi.fn();
    const h2 = vi.fn();
    emitter.on("hello", h1);
    emitter.on("count", h2);
    emitter.removeAllListeners();
    emitter.emit("hello", "test");
    emitter.emit("count", 42);
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  it("listenerCount returns correct count", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    expect(emitter.listenerCount("hello")).toBe(0);
    emitter.on("hello", vi.fn());
    expect(emitter.listenerCount("hello")).toBe(1);
    emitter.on("hello", vi.fn());
    expect(emitter.listenerCount("hello")).toBe(2);
  });

  it("handles events with no listeners gracefully", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    expect(() => emitter.emit("hello", "test")).not.toThrow();
  });

  it("catches errors in listeners without crashing", () => {
    const emitter = new TypedEventEmitter<TestEvents>();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    emitter.on("hello", () => {
      throw new Error("boom");
    });
    expect(() => emitter.emit("hello", "test")).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

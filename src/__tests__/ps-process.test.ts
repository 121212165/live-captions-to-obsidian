import { describe, it, expect } from "vitest";
import { PsProcess } from "../lib/ps-process.js";

describe("PsProcess", () => {
  it("isRunning is false initially", () => {
    const ps = new PsProcess();
    expect(ps.isRunning).toBe(false);
  });

  it("stop resolves immediately when not started", async () => {
    const ps = new PsProcess();
    await expect(ps.stop()).resolves.toBeUndefined();
  });

  it("kill does not throw when not started", () => {
    const ps = new PsProcess();
    expect(() => ps.kill()).not.toThrow();
  });

  it("sendCommand does not throw when not started", () => {
    const ps = new PsProcess();
    expect(() => ps.sendCommand({ cmd: "test" })).not.toThrow();
  });
});

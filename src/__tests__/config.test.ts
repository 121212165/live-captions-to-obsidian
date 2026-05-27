import { describe, it, expect } from "vitest";
import { defaultConfig } from "../config.js";

describe("defaultConfig", () => {
  it("包含所有必需的配置字段", () => {
    expect(defaultConfig).toHaveProperty("vaultPath");
    expect(defaultConfig).toHaveProperty("notesDir");
    expect(defaultConfig).toHaveProperty("watchInterval");
    expect(defaultConfig).toHaveProperty("captureInterval");
    expect(defaultConfig).toHaveProperty("windowTitle");
  });

  it("vaultPath 是字符串且非空", () => {
    expect(typeof defaultConfig.vaultPath).toBe("string");
    expect(defaultConfig.vaultPath.length).toBeGreaterThan(0);
  });

  it("notesDir 是字符串且非空", () => {
    expect(typeof defaultConfig.notesDir).toBe("string");
    expect(defaultConfig.notesDir.length).toBeGreaterThan(0);
  });

  it("windowTitle 是字符串且非空", () => {
    expect(typeof defaultConfig.windowTitle).toBe("string");
    expect(defaultConfig.windowTitle.length).toBeGreaterThan(0);
  });

  it("间隔值在合理范围内", () => {
    expect(defaultConfig.watchInterval).toBeGreaterThanOrEqual(200);
    expect(defaultConfig.captureInterval).toBeGreaterThanOrEqual(100);
  });

  it("watchInterval 是正整数", () => {
    expect(Number.isInteger(defaultConfig.watchInterval)).toBe(true);
    expect(defaultConfig.watchInterval).toBeGreaterThan(0);
  });

  it("captureInterval 是正整数", () => {
    expect(Number.isInteger(defaultConfig.captureInterval)).toBe(true);
    expect(defaultConfig.captureInterval).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveConfig } from "../config-loader.js";
import { defaultConfig } from "../config.js";

describe("resolveConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Clear all LIVE_CAPTIONS_ env vars
    delete process.env.LIVE_CAPTIONS_VAULT;
    delete process.env.LIVE_CAPTIONS_DIR;
    delete process.env.LIVE_CAPTIONS_TITLE;
    delete process.env.LIVE_CAPTIONS_WATCH_INTERVAL;
    delete process.env.LIVE_CAPTIONS_CAPTURE_INTERVAL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default config with no overrides", () => {
    const { config, sources } = resolveConfig({});
    expect(config.vaultPath).toBe(defaultConfig.vaultPath);
    expect(config.notesDir).toBe(defaultConfig.notesDir);
    expect(config.windowTitle).toBe(defaultConfig.windowTitle);
    expect(sources).toContain("defaults");
  });

  it("applies env var overrides", () => {
    process.env.LIVE_CAPTIONS_VAULT = "D:\\TestVault";
    const { config, sources } = resolveConfig({});
    expect(config.vaultPath).toBe("D:\\TestVault");
    expect(sources).toContain("env");
  });

  it("CLI overrides take highest priority", () => {
    process.env.LIVE_CAPTIONS_VAULT = "D:\\EnvVault";
    const { config } = resolveConfig({ vaultPath: "D:\\CliVault" });
    expect(config.vaultPath).toBe("D:\\CliVault");
  });

  it("CLI overrides are included in sources", () => {
    const { sources } = resolveConfig({ vaultPath: "test" });
    expect(sources).toContain("cli");
  });

  it("returns default windowTitle when no override", () => {
    const { config } = resolveConfig({});
    expect(config.windowTitle).toBe("实时字幕");
  });

  it("merges partial CLI overrides with defaults", () => {
    const { config } = resolveConfig({ notesDir: "custom" });
    expect(config.notesDir).toBe("custom");
    expect(config.vaultPath).toBe(defaultConfig.vaultPath);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolveConfig } from "../config-loader.js";
import { defaultConfig } from "../config.js";

describe("resolveConfig", () => {
  const originalEnv = process.env;
  const originalCwd = process.cwd;

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
    process.cwd = originalCwd;
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

  it("applies env var overrides for watchInterval and captureInterval", () => {
    process.env.LIVE_CAPTIONS_WATCH_INTERVAL = "5000";
    process.env.LIVE_CAPTIONS_CAPTURE_INTERVAL = "2000";
    const { config, sources } = resolveConfig({});
    expect(config.watchInterval).toBe(5000);
    expect(config.captureInterval).toBe(2000);
    expect(sources).toContain("env");
  });

  it("applies env var overrides for notesDir and windowTitle", () => {
    process.env.LIVE_CAPTIONS_DIR = "subtitles";
    process.env.LIVE_CAPTIONS_TITLE = "Live Captions";
    const { config } = resolveConfig({});
    expect(config.notesDir).toBe("subtitles");
    expect(config.windowTitle).toBe("Live Captions");
  });

  it("loads config from file specified via cliConfigPath", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-test-"));
    const cfgPath = join(tmp, "test-config.json");
    writeFileSync(cfgPath, JSON.stringify({ vaultPath: "/from/file", notesDir: "file-notes" }));
    const { config, sources } = resolveConfig({}, cfgPath);
    expect(config.vaultPath).toBe("/from/file");
    expect(config.notesDir).toBe("file-notes");
    expect(sources).toContain(cfgPath);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("auto-discovers .live-captions.json from cwd", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-disc-"));
    writeFileSync(join(tmp, ".live-captions.json"), JSON.stringify({ notesDir: "discovered" }));
    process.cwd = () => tmp;
    const { config, sources } = resolveConfig({});
    expect(config.notesDir).toBe("discovered");
    expect(sources.some((s) => s.includes(".live-captions.json"))).toBe(true);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("handles invalid JSON in config file gracefully", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-bad-"));
    const cfgPath = join(tmp, "bad.json");
    writeFileSync(cfgPath, "not valid json {{{");
    const { config } = resolveConfig({}, cfgPath);
    // Should fall back to defaults
    expect(config.vaultPath).toBe(defaultConfig.vaultPath);
    rmSync(tmp, { recursive: true, force: true });
  });

  it("config file overrides env vars (file > env priority)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-pri-"));
    const cfgPath = join(tmp, "priority.json");
    writeFileSync(cfgPath, JSON.stringify({ notesDir: "from-file" }));
    process.env.LIVE_CAPTIONS_DIR = "from-env";
    const { config } = resolveConfig({}, cfgPath);
    expect(config.notesDir).toBe("from-file");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("CLI overrides config file", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-cli-"));
    const cfgPath = join(tmp, "file.json");
    writeFileSync(cfgPath, JSON.stringify({ notesDir: "from-file" }));
    const { config } = resolveConfig({ notesDir: "from-cli" }, cfgPath);
    expect(config.notesDir).toBe("from-cli");
    rmSync(tmp, { recursive: true, force: true });
  });

  it("config file with logging field does not affect config", () => {
    const tmp = mkdtempSync(join(tmpdir(), "cfg-log-"));
    const cfgPath = join(tmp, "log.json");
    writeFileSync(cfgPath, JSON.stringify({
      notesDir: "logged",
      logging: { verbose: true, logFile: "out.log" },
    }));
    const { config } = resolveConfig({}, cfgPath);
    expect(config.notesDir).toBe("logged");
    // logging should be stripped (not merged into Config)
    expect((config as Record<string, unknown>).logging).toBeUndefined();
    rmSync(tmp, { recursive: true, force: true });
  });
});

import { describe, it, expect } from "vitest";
import { parseArgs, validateConfig } from "../cli.js";
import { defaultConfig } from "../config.js";

describe("parseArgs", () => {
  it("returns empty config and options for no args", () => {
    const { config, options } = parseArgs([]);
    expect(config).toEqual({});
    expect(options).toEqual({});
  });

  it("parses --vault", () => {
    const { config } = parseArgs(["--vault", "D:\\MyVault"]);
    expect(config.vaultPath).toBe("D:\\MyVault");
  });

  it("parses --dir", () => {
    const { config } = parseArgs(["--dir", "captions"]);
    expect(config.notesDir).toBe("captions");
  });

  it("parses --title", () => {
    const { config } = parseArgs(["--title", "Live Captions"]);
    expect(config.windowTitle).toBe("Live Captions");
  });

  it("parses --watch interval", () => {
    const { config } = parseArgs(["--watch", "3000"]);
    expect(config.watchInterval).toBe(3000);
  });

  it("parses --capture interval", () => {
    const { config } = parseArgs(["--capture", "1000"]);
    expect(config.captureInterval).toBe(1000);
  });

  it("parses --help", () => {
    const { options } = parseArgs(["--help"]);
    expect(options.help).toBe(true);
  });

  it("parses -h", () => {
    const { options } = parseArgs(["-h"]);
    expect(options.help).toBe(true);
  });

  it("parses --version", () => {
    const { options } = parseArgs(["--version"]);
    expect(options.version).toBe(true);
  });

  it("parses --verbose", () => {
    const { options } = parseArgs(["--verbose"]);
    expect(options.verbose).toBe(true);
  });

  it("parses -v", () => {
    const { options } = parseArgs(["-v"]);
    expect(options.verbose).toBe(true);
  });

  it("parses --config", () => {
    const { options } = parseArgs(["--config", "my-config.json"]);
    expect(options.configPath).toBe("my-config.json");
  });

  it("parses --log-file", () => {
    const { options } = parseArgs(["--log-file", "output.log"]);
    expect(options.logFile).toBe("output.log");
  });

  it("parses --no-color", () => {
    const { options } = parseArgs(["--no-color"]);
    expect(options.noColor).toBe(true);
  });

  it("parses multiple args", () => {
    const { config, options } = parseArgs(["--vault", "D:\\V", "--verbose", "--dir", "subs"]);
    expect(config.vaultPath).toBe("D:\\V");
    expect(config.notesDir).toBe("subs");
    expect(options.verbose).toBe(true);
  });
});

describe("validateConfig", () => {
  it("returns no errors for valid config", () => {
    expect(validateConfig(defaultConfig)).toEqual([]);
  });

  it("errors on empty vaultPath", () => {
    expect(validateConfig({ ...defaultConfig, vaultPath: "" })).toContain("vaultPath 不能为空");
  });

  it("errors on empty notesDir", () => {
    expect(validateConfig({ ...defaultConfig, notesDir: "" })).toContain("notesDir 不能为空");
  });

  it("errors on empty windowTitle", () => {
    expect(validateConfig({ ...defaultConfig, windowTitle: "" })).toContain("windowTitle 不能为空");
  });

  it("errors on watchInterval too small", () => {
    expect(validateConfig({ ...defaultConfig, watchInterval: 100 })).toContain("watchInterval 不能小于 200ms");
  });

  it("errors on captureInterval too small", () => {
    expect(validateConfig({ ...defaultConfig, captureInterval: 50 })).toContain("captureInterval 不能小于 100ms");
  });

  it("returns multiple errors", () => {
    const errors = validateConfig({ ...defaultConfig, vaultPath: "", notesDir: "" });
    expect(errors.length).toBe(2);
  });
});

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { Config, defaultConfig } from "./config.js";

/**
 * 配置文件结构（与 Config 部分重叠，支持可选字段）
 */
export interface ConfigFile {
  vaultPath?: string;
  notesDir?: string;
  watchInterval?: number;
  captureInterval?: number;
  windowTitle?: string;
  logging?: {
    verbose?: boolean;
    logFile?: string;
  };
}

const CONFIG_FILE_NAMES = [".live-captions.json", "live-captions.json"];

/**
 * 自动发现配置文件（当前目录 → 用户主目录）
 */
function discoverConfigFile(cwd: string): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const p = join(cwd, name);
    if (existsSync(p)) return p;
  }
  const home = process.env.USERPROFILE || process.env.HOME;
  if (home) {
    for (const name of CONFIG_FILE_NAMES) {
      const p = join(home, name);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

/**
 * 从文件加载配置
 */
function loadConfigFile(path: string): ConfigFile | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ConfigFile;
  } catch (e) {
    console.warn(`[警告] 无法读取配置文件 ${path}: ${(e as Error).message}`);
    return null;
  }
}

/**
 * 从环境变量加载覆盖
 */
function loadEnvOverrides(): Partial<Config> {
  const env: Partial<Config> = {};
  if (process.env.LIVE_CAPTIONS_VAULT) env.vaultPath = process.env.LIVE_CAPTIONS_VAULT;
  if (process.env.LIVE_CAPTIONS_DIR) env.notesDir = process.env.LIVE_CAPTIONS_DIR;
  if (process.env.LIVE_CAPTIONS_TITLE) env.windowTitle = process.env.LIVE_CAPTIONS_TITLE;
  if (process.env.LIVE_CAPTIONS_WATCH_INTERVAL) {
    env.watchInterval = parseInt(process.env.LIVE_CAPTIONS_WATCH_INTERVAL, 10);
  }
  if (process.env.LIVE_CAPTIONS_CAPTURE_INTERVAL) {
    env.captureInterval = parseInt(process.env.LIVE_CAPTIONS_CAPTURE_INTERVAL, 10);
  }
  return env;
}

export interface ResolvedConfig {
  config: Config;
  sources: string[];
}

/**
 * 多源配置解析（优先级：CLI > 配置文件 > 环境变量 > 默认值）
 */
export function resolveConfig(
  cliOverrides: Partial<Config>,
  cliConfigPath?: string,
): ResolvedConfig {
  const sources: string[] = [];

  // 层级 1: 默认值
  let merged: Config = { ...defaultConfig };
  sources.push("defaults");

  // 层级 2: 环境变量
  const envOverrides = loadEnvOverrides();
  if (Object.keys(envOverrides).length > 0) {
    merged = { ...merged, ...envOverrides };
    sources.push("env");
  }

  // 层级 3: 配置文件
  const configPath = cliConfigPath || discoverConfigFile(process.cwd());
  if (configPath) {
    const configFile = loadConfigFile(configPath);
    if (configFile) {
      const { logging: _logging, ...cfgRest } = configFile;
      // _logging is reserved for future use (file logging)
      void _logging;
      merged = { ...merged, ...cfgRest };
      sources.push(configPath);
    }
  }

  // 层级 4: CLI 参数（最高优先级）
  const hasCliOverrides = Object.keys(cliOverrides).length > 0;
  if (hasCliOverrides) {
    merged = { ...merged, ...cliOverrides };
    sources.push("cli");
  }

  return { config: merged, sources };
}

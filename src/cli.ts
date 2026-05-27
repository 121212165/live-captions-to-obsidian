import { Config, defaultConfig } from "./config.js";

export interface CliOptions {
  help?: boolean;
  version?: boolean;
  verbose?: boolean;
  configPath?: string;
  logFile?: string;
  noColor?: boolean;
}

const VERSION = "1.0.0";

export function printHelp(): void {
  console.log(`
Live Captions to Obsidian v${VERSION}

用法:
  npx tsx src/index.ts [选项]

选项:
  --vault <path>     Obsidian 仓库路径 (默认: ${defaultConfig.vaultPath})
  --dir <name>       仓库内字幕笔记子目录 (默认: ${defaultConfig.notesDir})
  --title <title>    实时字幕窗口标题 (默认: ${defaultConfig.windowTitle})
  --watch <ms>       窗口检测轮询间隔 (默认: ${defaultConfig.watchInterval})
  --capture <ms>     字幕捕获轮询间隔 (默认: ${defaultConfig.captureInterval})
  --config <path>    配置文件路径
  --verbose, -v      启用详细日志
  --log-file <path>  日志输出文件路径
  --no-color         禁用彩色输出
  --help, -h         显示此帮助信息
  --version          显示版本号

示例:
  npx tsx src/index.ts --vault "D:\\MyVault" --dir "captions" --title "Live Captions"
`);
}

export function printVersion(): void {
  console.log(`live-captions-to-obsidian v${VERSION}`);
}

function requireValue(argv: string[], index: number, name: string): string {
  const next = argv[index + 1];
  if (next === undefined || next.startsWith("--")) {
    console.error(`[错误] 参数 --${name} 需要一个值`);
    process.exit(1);
  }
  return next;
}

export function parseArgs(argv: string[]): { config: Partial<Config>; options: CliOptions } {
  const config: Partial<Config> = {};
  const options: CliOptions = {};
  const unknown: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--vault":
        config.vaultPath = requireValue(argv, i++, "vault");
        break;
      case "--dir":
        config.notesDir = requireValue(argv, i++, "dir");
        break;
      case "--title":
        config.windowTitle = requireValue(argv, i++, "title");
        break;
      case "--watch":
        config.watchInterval = parseInt(requireValue(argv, i++, "watch"), 10);
        break;
      case "--capture":
        config.captureInterval = parseInt(requireValue(argv, i++, "capture"), 10);
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--version":
        options.version = true;
        break;
      case "--config":
      case "-c":
        options.configPath = requireValue(argv, i++, "config");
        break;
      case "--log-file":
        options.logFile = requireValue(argv, i++, "log-file");
        break;
      case "--no-color":
        options.noColor = true;
        break;
      default:
        const arg = argv[i];
        if (arg && arg.startsWith("--")) unknown.push(arg);
    }
  }

  if (unknown.length > 0) {
    console.warn(`[警告] 未知参数: ${unknown.join(", ")}`);
    console.warn("请使用 --help 查看可用参数");
  }

  return { config, options };
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  if (!config.vaultPath) errors.push("vaultPath 不能为空");
  if (!config.notesDir) errors.push("notesDir 不能为空");
  if (!config.windowTitle) errors.push("windowTitle 不能为空");
  if (config.watchInterval < 200) errors.push("watchInterval 不能小于 200ms");
  if (config.captureInterval < 100) errors.push("captureInterval 不能小于 100ms");
  return errors;
}

import { parseArgs, printHelp, printVersion, validateConfig } from "./cli.js";
import { resolveConfig } from "./config-loader.js";
import { Application } from "./app.js";
import { registerLifecycle } from "./lifecycle.js";

const RED = "\x1b[31m";
const RESET = "\x1b[0m";

const { config: cliOverrides, options: cliOptions } = parseArgs(process.argv.slice(2));

if (cliOptions.help) {
  printHelp();
  process.exit(0);
}
if (cliOptions.version) {
  printVersion();
  process.exit(0);
}

const { config } = resolveConfig(cliOverrides, cliOptions.configPath);

const configErrors = validateConfig(config);
if (configErrors.length > 0) {
  console.error(`${RED}[错误]${RESET} 配置验证失败:`);
  configErrors.forEach((err) => console.error(`  - ${err}`));
  process.exit(1);
}

const app = new Application(config);
registerLifecycle(app);
app.start();

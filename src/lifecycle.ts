const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

interface AppLike {
  stop(): Promise<void>;
}

export function registerLifecycle(app: AppLike): void {
  process.on("SIGINT", async () => {
    console.log(`\n${DIM}正在退出...${RESET}`);
    await app.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log(`\n${DIM}收到 SIGTERM，正在退出...${RESET}`);
    await app.stop();
    process.exit(0);
  });

  process.on("uncaughtException", async (err) => {
    console.error(`${RED}[致命错误]${RESET} 未捕获异常: ${err.message}`);
    await app.stop();
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error(`${RED}[致命错误]${RESET} 未处理的 Promise 拒绝: ${reason}`);
  });
}

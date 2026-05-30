import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ObsidianWriter } from "../writer.js";
import { defaultConfig } from "../config.js";

describe("ObsidianWriter", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "writer-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  function createWriter(overrides?: Partial<typeof defaultConfig>) {
    return new ObsidianWriter({
      ...defaultConfig,
      vaultPath: tmpDir,
      ...overrides,
    });
  }

  it("构造函数创建笔记目录", () => {
    const config = { ...defaultConfig, vaultPath: tmpDir };
    createWriter();
    const dirPath = join(tmpDir, config.notesDir);
    expect(existsSync(dirPath)).toBe(true);
  });

  it("beginSession 创建文件头", async () => {
    const writer = createWriter();
    await writer.beginSession();
    const filePath = writer.getFilePath();
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toContain("# 字幕笔记 -");
    expect(content).toContain("年");
    expect(content).toContain("月");
    expect(content).toContain("日");
    expect(content).toContain("开始捕获");
  });

  it("beginSession 文件已存在时追加分隔符而非重复文件头", async () => {
    const writer = createWriter();
    await writer.beginSession();
    const filePath = writer.getFilePath();

    // 第二次 beginSession
    await writer.beginSession();
    const secondContent = readFileSync(filePath, "utf-8");

    // 第二次调用应当追加 --- 分隔符，而非重复文件头
    expect(secondContent).toContain("---");
    // 文件头应只出现一次
    const headerCount = (secondContent.match(/# 字幕笔记 -/g) || []).length;
    expect(headerCount).toBe(1);
  });

  it("writeLines 写入带时间戳的内容", async () => {
    const writer = createWriter();
    await writer.beginSession();

    const filePath = writer.getFilePath();
    const beforeSize = readFileSync(filePath, "utf-8").length;

    await writer.writeLines(["测试字幕行1", "测试字幕行2"]);

    const afterContent = readFileSync(filePath, "utf-8");
    expect(afterContent.length).toBeGreaterThan(beforeSize);
    expect(afterContent).toContain("测试字幕行1");
    expect(afterContent).toContain("测试字幕行2");

    // 每行应有时间戳前缀（HH:MM:SS 格式）
    const lines = afterContent.split("\n").filter((l) => l.includes("测试字幕"));
    for (const line of lines) {
      expect(line).toMatch(/^\d{2}:\d{2}:\d{2} \| .+字幕行/);
    }
  });

  it("多次 writeLines 持续追加内容", async () => {
    const writer = createWriter();
    await writer.beginSession();

    await writer.writeLines(["第一行"]);
    await writer.writeLines(["第二行"]);
    await writer.writeLines(["第三行"]);

    const content = readFileSync(writer.getFilePath(), "utf-8");
    expect(content).toContain("第一行");
    expect(content).toContain("第二行");
    expect(content).toContain("第三行");
  });

  it("getFilePath 返回字符串", () => {
    const writer = createWriter();
    const filePath = writer.getFilePath();
    expect(typeof filePath).toBe("string");
    expect(filePath.length).toBeGreaterThan(0);
  });

  it("getFilePath 包含正确的目录和文件名格式", () => {
    const writer = createWriter();
    const filePath = writer.getFilePath();
    expect(filePath).toContain(tmpDir);
    expect(filePath).toContain(defaultConfig.notesDir);
    expect(filePath).toMatch(/字幕-\d{4}-\d{2}-\d{2}\.md$/);
  });

  it("writeLines 日期变更时切换到新文件并创建新会话", async () => {
    const writer = createWriter();
    await writer.beginSession();
    const originalPath = writer.getFilePath();
    await writer.writeLines(["第一天的内容"]);

    // Simulate date change by advancing the clock to the next day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    vi.setSystemTime(tomorrow);

    await writer.writeLines(["第二天的内容"]);

    const newPath = writer.getFilePath();
    expect(newPath).not.toBe(originalPath);
    expect(existsSync(newPath)).toBe(true);
    const newContent = readFileSync(newPath, "utf-8");
    expect(newContent).toContain("# 字幕笔记 -");
    expect(newContent).toContain("第二天的内容");

    vi.useRealTimers();
  });

  it("自定义 notesDir 创建对应子目录", () => {
    const writer = createWriter({ notesDir: "custom-notes" });
    const dirPath = join(tmpDir, "custom-notes");
    expect(existsSync(dirPath)).toBe(true);
    expect(writer.getFilePath()).toContain("custom-notes");
  });
});

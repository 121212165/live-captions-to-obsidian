import { describe, it, expect } from "vitest";
import { extractNewLines } from "../lib/dedup.js";

describe("extractNewLines", () => {
  it("正常追加：上次文本是当前文本前缀时返回新增行", () => {
    const first = extractNewLines(["第一行", "第二行"], "");
    const second = extractNewLines(["第一行", "第二行", "第三行"], first.currentText);
    expect(second.newLines).toEqual(["第三行"]);
  });

  it("完全重写：上次文本不是前缀时返回全部新内容", () => {
    const first = extractNewLines(["旧内容"], "");
    const second = extractNewLines(["新内容"], first.currentText);
    expect(second.newLines).toEqual(["新内容"]);
  });

  it("部分重写：公共前缀后替换返回新内容", () => {
    const first = extractNewLines(["开始；旧结尾"], "");
    const second = extractNewLines(["开始；新结尾"], first.currentText);
    expect(second.newLines).toEqual(["新结尾"]);
  });

  it("空输入返回空数组和空字符串", () => {
    const first = extractNewLines(["之前有内容"], "");
    const result = extractNewLines([], first.currentText);
    expect(result.newLines).toEqual([]);
    expect(result.currentText).toBe("");
  });

  it("无新内容返回空数组", () => {
    const first = extractNewLines(["相同内容"], "");
    const second = extractNewLines(["相同内容"], first.currentText);
    expect(second.newLines).toEqual([]);
  });

  it("首次调用时 prevText 为空，全部视为新内容", () => {
    const result = extractNewLines(["第一条", "第二条"], "");
    expect(result.newLines).toEqual(["第一条", "第二条"]);
  });

  it("多行新增返回所有新增行", () => {
    const first = extractNewLines(["行1"], "");
    const second = extractNewLines(["行1", "行2", "行3"], first.currentText);
    expect(second.newLines).toEqual(["行2", "行3"]);
  });

  it("空行被过滤", () => {
    const first = extractNewLines(["第一行"], "");
    const second = extractNewLines(["第一行", "", "  ", "第二行"], first.currentText);
    expect(second.newLines).toEqual(["第二行"]);
  });

  it("prevText 为空字符串时返回全部行", () => {
    const result = extractNewLines(["行A", "行B", "行C"], "");
    expect(result.newLines).toEqual(["行A", "行B", "行C"]);
    expect(result.currentText).toBe("行A\n行B\n行C");
  });

  it("纯空白行输入返回空结果", () => {
    const result = extractNewLines(["  ", "\t", ""], "");
    expect(result.newLines).toEqual([]);
    expect(result.currentText).toBe("  \n\t\n");
  });
});

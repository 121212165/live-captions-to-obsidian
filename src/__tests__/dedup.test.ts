import { describe, it, expect } from "vitest";
import { extractNewLines } from "../lib/dedup.js";

describe("extractNewLines", () => {
  it("正常追加：上次文本是当前文本前缀时返回新增行", () => {
    const first = extractNewLines(["第一行", "第二行"], "");
    const second = extractNewLines(
      ["第一行", "第二行", "第三行"],
      first.currentText,
    );
    expect(second.newLines).toEqual(["第三行"]);
  });

  it("完全重写：上次文本不是前缀时返回全部新内容", () => {
    const first = extractNewLines(["旧内容"], "");
    const second = extractNewLines(["新内容"], first.currentText);
    expect(second.newLines).toEqual(["新内容"]);
  });

  it("部分重写：行内容变化时整行视为新内容", () => {
    const first = extractNewLines(["开始；旧结尾"], "");
    const second = extractNewLines(["开始；新结尾"], first.currentText);
    expect(second.newLines).toEqual(["开始；新结尾"]);
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
    const second = extractNewLines(
      ["第一行", "", "  ", "第二行"],
      first.currentText,
    );
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

  it("滚动场景：顶部行消失、底部行新增时只返回新行", () => {
    // 模拟 Live Captions 滚动：窗口显示 3 行，顶部滚出、底部滚入
    const r1 = extractNewLines(["行A", "行B", "行C"], "");
    expect(r1.newLines).toEqual(["行A", "行B", "行C"]);

    const r2 = extractNewLines(["行B", "行C", "行D"], r1.currentText);
    expect(r2.newLines).toEqual(["行D"]);

    const r3 = extractNewLines(["行C", "行D", "行E"], r2.currentText);
    expect(r3.newLines).toEqual(["行E"]);
  });

  it("滚动场景：多行同时滚出时只返回新行", () => {
    const r1 = extractNewLines(["L1", "L2", "L3", "L4"], "");
    // 两行同时滚出
    const r2 = extractNewLines(["L3", "L4", "L5", "L6"], r1.currentText);
    expect(r2.newLines).toEqual(["L5", "L6"]);
  });

  it("滚动场景：连续多次滚动不产生重复", () => {
    let prev = "";
    const written: string[] = [];

    const batches = [
      ["We will be discussing AI development"],
      ["We will be discussing AI development", "Large language models are transforming"],
      ["We will be discussing AI development", "Large language models are transforming", "Let's look at some practical examples"],
      ["Large language models are transforming", "Let's look at some practical examples", "First we need to understand the basics"],
      ["Let's look at some practical examples", "First we need to understand the basics", "Neural networks form the foundation"],
      ["First we need to understand the basics", "Neural networks form the foundation", "Training requires large datasets"],
      ["Neural networks form the foundation", "Training requires large datasets", "The results have been remarkable"],
      ["Training requires large datasets", "The results have been remarkable", "Let's summarize what we learned"],
    ];

    for (const batch of batches) {
      const result = extractNewLines(batch, prev);
      written.push(...result.newLines);
      prev = result.currentText;
    }

    // 每行应只出现一次（共 8 行唯一内容）
    expect(written).toEqual([
      "We will be discussing AI development",
      "Large language models are transforming",
      "Let's look at some practical examples",
      "First we need to understand the basics",
      "Neural networks form the foundation",
      "Training requires large datasets",
      "The results have been remarkable",
      "Let's summarize what we learned",
    ]);
  });

  it("滚动不会产生字符级截断损坏", () => {
    // 回归测试：旧的字符级 LCP 会把 "Let's" 截断为 "et's"
    const r1 = extractNewLines(
      ["Large language models are transforming"],
      "",
    );
    const r2 = extractNewLines(
      ["Let's look at some practical examples"],
      r1.currentText,
    );
    // 应返回完整行，不能出现 "et's..." 截断
    expect(r2.newLines).toEqual(["Let's look at some practical examples"]);
  });
});

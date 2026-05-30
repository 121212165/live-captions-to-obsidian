export interface DedupResult {
  newLines: string[];
  currentText: string;
}

/**
 * 从累积文本中提取真正新增的内容。
 * Live Captions 每次轮询返回一个增长的文本块。
 * 通过与上一次完整文本比较，找出增量。
 *
 * 支持三种场景:
 * 1. 文本追加增长 (startsWith)
 * 2. 滚动 — 顶部行消失、底部行新增 (行级后缀/前缀重叠)
 * 3. 完全重写 (无重叠，全部视为新内容)
 *
 * @param rawLines - 当前轮询获取的文本行数组
 * @param prevText - 上一次处理的完整文本
 * @returns 新增的行和当前完整文本
 */
export function extractNewLines(rawLines: string[], prevText: string): DedupResult {
  const currentText = rawLines.join("\n");
  if (!currentText) return { newLines: [], currentText };

  // Case 1: 正常追加 — currentText 是 prevText 的延伸
  if (currentText.startsWith(prevText)) {
    const newContent = currentText.substring(prevText.length);
    if (!newContent.trim()) return { newLines: [], currentText };
    return {
      newLines: newContent.split("\n").filter((l) => l.trim().length > 0),
      currentText,
    };
  }

  // Case 2: 行级重叠检测 — 处理 Live Captions 滚动
  // 找 prevLines 最长后缀 == currentLines 前缀
  const prevLines = prevText.split("\n");
  const currentLines = rawLines;
  const maxOverlap = Math.min(prevLines.length, currentLines.length);

  for (let len = maxOverlap; len >= 1; len--) {
    const prevSuffix = prevLines.slice(prevLines.length - len);
    const currPrefix = currentLines.slice(0, len);
    if (prevSuffix.every((line, idx) => line === currPrefix[idx])) {
      const newLines = currentLines.slice(len).filter((l) => l.trim().length > 0);
      return { newLines, currentText };
    }
  }

  // Case 3: 完全重写 — 无重叠，全部视为新内容
  const newLines = currentLines.filter((l) => l.trim().length > 0);
  return { newLines, currentText };
}

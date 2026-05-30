export interface DedupResult {
  newLines: string[];
  currentText: string;
}

/**
 * 从累积文本中提取真正新增的内容。
 * Live Captions 每次轮询返回一个增长的文本块。
 * 通过与上一次完整文本比较，找出增量。
 *
 * @param rawLines - 当前轮询获取的文本行数组
 * @param prevText - 上一次处理的完整文本
 * @returns 新增的行和当前完整文本
 */
export function extractNewLines(rawLines: string[], prevText: string): DedupResult {
  const currentText = rawLines.join("\n");
  if (!currentText) return { newLines: [], currentText };

  let newContent: string;

  if (currentText.startsWith(prevText)) {
    // 正常情况：文本追加增长
    newContent = currentText.substring(prevText.length);
  } else {
    // 文本被重写 — 找最长公共前缀
    let i = 0;
    while (i < currentText.length && i < prevText.length && currentText[i] === prevText[i]) {
      i++;
    }
    newContent = currentText.substring(i);
  }

  if (!newContent.trim()) return { newLines: [], currentText };

  return {
    newLines: newContent.split("\n").filter((l) => l.trim().length > 0),
    currentText,
  };
}

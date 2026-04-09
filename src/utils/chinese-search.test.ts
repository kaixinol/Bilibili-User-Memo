import { describe, it, expect } from "vitest";

// 直接复制纯函数逻辑，不依赖 OpenCC，保证 Node.js 下可运行
function isSubsequence(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

function isPartialMatch(query: string, target: string): boolean {
  if (query.length > target.length) return false;
  const targetChars = new Set(target);
  for (const ch of query) {
    if (!targetChars.has(ch)) return false;
  }
  return true;
}

function fuzzyMatch(query: string, target: string): boolean {
  if (!query || !target) return !query;
  if (target.includes(query)) return true;
  if (isSubsequence(query, target)) return true;
  if (query.length > target.length && isSubsequence(target, query)) return true;
  if (isPartialMatch(query, target)) return true;
  return false;
}

// 模拟 matchesChineseSearch 的核心逻辑（不带 OpenCC 变体）
function matchQuery(query: string, target: string, enableFuzzy: boolean): boolean {
  if (!query) return true;
  if (enableFuzzy) return fuzzyMatch(query, target);
  return target.includes(query);
}

describe("fuzzyMatch — 核心匹配逻辑", () => {
  // ── 子串匹配（精确） ──
  describe("includes 子串匹配", () => {
    it("'测试' 匹配 '这是一个测试'", () => {
      expect(fuzzyMatch("测试", "这是一个测试")).toBe(true);
    });
    it("'灰色泥巴' 匹配 '灰色泥巴'", () => {
      expect(fuzzyMatch("灰色泥巴", "灰色泥巴")).toBe(true);
    });
  });

  // ── 子序列匹配 ──
  describe("子序列匹配（字符按顺序出现）", () => {
    it("'abc' 匹配 'aXbXc'", () => {
      expect(fuzzyMatch("abc", "aXbXc")).toBe(true);
    });
    it("'hlo' 匹配 'hello'", () => {
      expect(fuzzyMatch("hlo", "hello")).toBe(true);
    });
    it("'灰泥' 匹配 '灰色泥巴'（灰在0，泥在2，按顺序）", () => {
      expect(fuzzyMatch("灰泥", "灰色泥巴")).toBe(true);
    });
  });

  // ── 反向子序列匹配 ──
  describe("反向子序列匹配（query 比 target 长）", () => {
    it("'灰色泥巴' 匹配 '灰泥'（灰在0，泥在1，按顺序）", () => {
      expect(fuzzyMatch("灰色泥巴", "灰泥")).toBe(true);
    });
    it("'hello world' 匹配 'hlo'（h-l-o 按顺序出现）", () => {
      expect(fuzzyMatch("hello world", "hlo")).toBe(true);
    });
  });

  // ── 部分匹配（字符集合） ──
  describe("部分匹配（短词字符都在长文本中）", () => {
    it("'灰泥' 匹配 '灰色泥巴'（灰✓ 泥✓）", () => {
      expect(fuzzyMatch("灰泥", "灰色泥巴")).toBe(true);
    });
    it("'色巴' 匹配 '灰色泥巴'（色✓ 巴✓）", () => {
      expect(fuzzyMatch("色巴", "灰色泥巴")).toBe(true);
    });
  });

  // ── 不匹配 ──
  describe("不匹配", () => {
    it("'xyz' 不匹配 'abcdef'", () => {
      expect(fuzzyMatch("xyz", "abcdef")).toBe(false);
    });
  });

  // ── 边界条件 ──
  describe("边界条件", () => {
    it("空 query 返回 true", () => {
      expect(fuzzyMatch("", "anything")).toBe(true);
    });
    it("空 target + 非空 query 返回 false", () => {
      expect(fuzzyMatch("query", "")).toBe(false);
    });
  });
});

describe("matchesChineseSearch 模拟 — 精确 vs 模糊 对比", () => {
  it("精确模式：'灰泥' 不匹配 '灰色泥巴'；模糊模式：匹配", () => {
    expect(matchQuery("灰泥", "灰色泥巴", false)).toBe(false);
    expect(matchQuery("灰泥", "灰色泥巴", true)).toBe(true);
  });

  it("精确模式：'abc' 不匹配 'aXbXc'；模糊模式：匹配", () => {
    expect(matchQuery("abc", "aXbXc", false)).toBe(false);
    expect(matchQuery("abc", "aXbXc", true)).toBe(true);
  });

  it("两种模式下 '测试' 都匹配 '这是一个测试'", () => {
    expect(matchQuery("测试", "这是一个测试", false)).toBe(true);
    expect(matchQuery("测试", "这是一个测试", true)).toBe(true);
  });

  it("精确模式：'灰色泥巴' 匹配 '灰色泥巴'（完全相等）", () => {
    expect(matchQuery("灰色泥巴", "灰色泥巴", false)).toBe(true);
    expect(matchQuery("灰色泥巴", "灰色泥巴", true)).toBe(true);
  });

  it("空 query 时两种模式都返回 true", () => {
    expect(matchQuery("", "anything", false)).toBe(true);
    expect(matchQuery("", "anything", true)).toBe(true);
  });
});

import { Converter as createOpenCCConverter } from "opencc-js";

export interface SearchForms {
  raw: string;
  variants: string[];
}

type Converter = (input: string) => string;

const searchFormCache = new Map<string, SearchForms>();
const converterCache = new Map<string, Converter | null>();

function createConverter(
  from: "cn" | "tw",
  to: "cn" | "tw",
): Converter | null {
  const cacheKey = `${from}->${to}`;
  const cached = converterCache.get(cacheKey);
  if (typeof cached !== "undefined") return cached;

  try {
    const converter = createOpenCCConverter({ from, to });
    converterCache.set(cacheKey, converter);
    return converter;
  } catch (error) {
    console.warn(
      `[Bilibili-User-Memo] 简繁搜索转换器初始化失败 (${from} -> ${to})`,
      error,
    );
    converterCache.set(cacheKey, null);
    return null;
  }
}

function convertWith(converter: Converter | null, text: string): string {
  if (!converter || !text) return text;
  try {
    return converter(text);
  } catch {
    return text;
  }
}

export function getSearchForms(value: string): SearchForms {
  const raw = value.trim().toLowerCase();
  const cached = searchFormCache.get(raw);
  if (cached) return cached;

  // opencc-js: { from: "tw", to: "cn" } = 繁体转简体
  //            { from: "cn", to: "tw" } = 简体转繁体
  const toSimplified = createConverter("tw", "cn");
  const toTraditional = createConverter("cn", "tw");
  const variants = Array.from(
    new Set([
      raw,
      convertWith(toSimplified, raw),
      convertWith(toTraditional, raw),
    ].filter(Boolean)),
  );
  const forms = { raw, variants };
  searchFormCache.set(raw, forms);
  return forms;
}

export function matchesChineseSearch(
  value: string | number | null | undefined,
  queryForms: SearchForms,
  enableFuzzySearch = false,
): boolean {
  if (!queryForms.raw) return true;

  const targetStr = String(value || "");
  const targetForms = getSearchForms(targetStr);

  if (enableFuzzySearch) {
    return queryForms.variants.some((query) =>
      targetForms.variants.some((target) => fuzzyMatch(query, target)),
    );
  }

  return queryForms.variants.some((query) =>
    targetForms.variants.some((target) => target.includes(query)),
  );
}

/**
 * 模糊匹配：支持子序列匹配、部分匹配、字符重排匹配
 * 优先使用 includes，不引入复杂算法
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (!query || !target) return !query;

  // 1. 优先：标准子串匹配（最快）
  if (target.includes(query)) return true;

  // 2. 子序列匹配：query 的字符按顺序出现在 target 中
  if (isSubsequence(query, target)) return true;

  // 2b. 反向子序列：query 比 target 长时，检查 target 是否是 query 的子序列
  // 例：query="灰色泥巴", target="灰泥" → target 的字符按顺序出现在 query 中 → true
  if (query.length > target.length && isSubsequence(target, query)) return true;

  // 3. 部分匹配：短词的每个字符都出现在长文本中（类似"灰泥"匹配"灰色泥巴"）
  if (isPartialMatch(query, target)) return true;

  return false;
}

/**
 * 子序列匹配：query 中的所有字符按顺序出现在 target 中
 * 例：abc 匹配 "aXbXc"
 */
function isSubsequence(query: string, target: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (target[ti] === query[qi]) qi++;
  }
  return qi === query.length;
}

/**
 * 部分匹配：query 的每个字符都存在于 target 中（不要求顺序）
 * 例："灰泥" 匹配 "灰色泥巴"（灰✓ 泥✓）
 */
function isPartialMatch(query: string, target: string): boolean {
  // 短词匹配长文本才有意义
  if (query.length > target.length) return false;

  const targetChars = new Set(target);
  for (const ch of query) {
    if (!targetChars.has(ch)) return false;
  }
  return true;
}

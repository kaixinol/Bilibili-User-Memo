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

  const toSimplified = createConverter("cn", "tw");
  const toTraditional = createConverter("tw", "cn");
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
): boolean {
  if (!queryForms.raw) return true;

  const targetForms = getSearchForms(String(value || ""));
  return queryForms.variants.some((query) =>
    targetForms.variants.some((target) => target.includes(query)),
  );
}

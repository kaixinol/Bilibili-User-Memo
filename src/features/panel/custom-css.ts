const MEMO_CSS_PROBE_SENTINEL = "#__biliMemoCssProbeSentinel__";

export interface MemoCssProbe {
  replaceSync(css: string): void;
  cssRules: ArrayLike<{ cssText?: string }>;
}

export function applyCustomFontColor(color: string) {
  if (!color) {
    document.documentElement.style.removeProperty("--custom-font-color");
    return;
  }

  document.documentElement.style.setProperty("--custom-font-color", color);
}

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("memo-container-dark-theme", dark);
}

export function getResolvedCustomFontColor(): string {
  return document.documentElement.style
    .getPropertyValue("--custom-font-color")
    .trim();
}

export function countTopLevelRuleStarts(css: string): number {
  let count = 0;
  let depth = 0;
  let inComment = false;
  let inString: "'" | '"' | null = null;
  let escaped = false;

  for (let index = 0; index < css.length; index += 1) {
    const current = css[index];
    const next = css[index + 1];

    if (inComment) {
      if (current === "*" && next === "/") {
        inComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === inString) inString = null;
      continue;
    }

    if (current === "/" && next === "*") {
      inComment = true;
      index += 1;
      continue;
    }
    if (current === "'" || current === '"') {
      inString = current;
      continue;
    }
    if (current === "{") {
      if (depth === 0) count += 1;
      depth += 1;
    } else if (current === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  return count;
}

export function validateMemoCss(
  css: string,
  probe: MemoCssProbe = new CSSStyleSheet(),
): string {
  const trimmedCss = css.trim();
  if (!trimmedCss) return "";

  try {
    probe.replaceSync(`${trimmedCss}\n${MEMO_CSS_PROBE_SENTINEL} {}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `未知错误: ${String(error)}`;
    return `CSS 语法错误：${message}`;
  }

  const rules = probe.cssRules;
  const lastRule = rules.length > 0 ? rules[rules.length - 1] : undefined;
  const sentinelKept = lastRule?.cssText
    ?.trimStart()
    .startsWith(MEMO_CSS_PROBE_SENTINEL);

  if (!sentinelKept) {
    return "CSS 未正确闭合（可能缺少 '}'），其后的内容会被忽略";
  }

  const parsedUserRules = rules.length - 1;
  const expectedUserRules = countTopLevelRuleStarts(trimmedCss);
  if (parsedUserRules === 0) {
    return "浏览器未解析出任何规则，可能语法错误被忽略";
  }
  if (parsedUserRules < expectedUserRules) {
    return `有 ${expectedUserRules - parsedUserRules} 条规则未被浏览器解析（选择器或 @规则可能有误）`;
  }
  return "";
}

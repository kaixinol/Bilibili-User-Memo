import { setCustomMemoCss } from "@/core/injection/injector";

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

function lintCss(css: string): string | null {
  const trimmedCss = css.trim();
  if (!trimmedCss) return null;

  let quote: "'" | '"' | null = null;
  let escaped = false;
  let commentDepth = 0;
  let braces = 0;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < trimmedCss.length; index += 1) {
    const current = trimmedCss[index];
    const next = trimmedCss[index + 1];

    if (commentDepth > 0) {
      if (current === "*" && next === "/") {
        commentDepth -= 1;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (current === "\\") {
        escaped = true;
        continue;
      }
      if (current === quote) {
        quote = null;
      }
      continue;
    }

    if (current === "/" && next === "*") {
      commentDepth += 1;
      index += 1;
      continue;
    }

    if (current === "'" || current === '"') {
      quote = current;
      continue;
    }

    if (current === "{") braces += 1;
    else if (current === "}") braces -= 1;
    else if (current === "(") parentheses += 1;
    else if (current === ")") parentheses -= 1;
    else if (current === "[") brackets += 1;
    else if (current === "]") brackets -= 1;

    if (braces < 0) return "多余的 '}'";
    if (parentheses < 0) return "多余的 ')'";
    if (brackets < 0) return "多余的 ']'";
  }

  if (commentDepth > 0) return "注释未闭合";
  if (quote) return `字符串未闭合：${quote}`;
  if (braces > 0) return "缺少 '}'";
  if (parentheses > 0) return "缺少 ')'";
  if (brackets > 0) return "缺少 ']'";
  return null;
}

function detectCssParsingIssue(
  css: string,
  ruleCount: number | undefined,
): string | null {
  if (!css.trim()) return null;
  if ((ruleCount || 0) !== 0) return null;

  const strippedCss = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");

  if (/{/.test(strippedCss)) {
    return "浏览器未解析出任何规则，可能语法错误被忽略";
  }

  return null;
}

export function resolveCustomCssStatus(
  css: string,
  result: ReturnType<typeof setCustomMemoCss>,
): string {
  const lintResult = lintCss(css);
  if (lintResult) return `CSS 语法警告：${lintResult}`;
  if (!result.ok) return `CSS 语法错误：${result.error || "无法解析"}`;

  const parsingWarning = detectCssParsingIssue(css, result.ruleCount);
  return parsingWarning ? `CSS 解析警告：${parsingWarning}` : "";
}

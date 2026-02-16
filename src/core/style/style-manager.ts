// src/core/style-manager.ts
import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { logger } from "../../utils/logger";
import allStyle from "../../styles/memo.css?inline";

// 全局基础样式表
const GLOBAL_STYLE_SHEET = new CSSStyleSheet();
GLOBAL_STYLE_SHEET.replaceSync(allStyle);

// 用户自定义样式表
const CUSTOM_MEMO_STYLE_SHEET = new CSSStyleSheet();
CUSTOM_MEMO_STYLE_SHEET.replaceSync("");

const MEMO_STYLE_TARGET_SELECTOR =
  ".bili-memo-tag, .editable-textarea, .bili-memo-input";

/**
 * 确保目标 Root (Document 或 ShadowRoot) 包含我们的样式表
 * @param root Document 或 ShadowRoot
 */
export function ensureMemoStyleSheets(root: Document | ShadowRoot) {
  const sheets = root.adoptedStyleSheets;
  const hasGlobal = sheets.includes(GLOBAL_STYLE_SHEET);
  const hasCustom = sheets.includes(CUSTOM_MEMO_STYLE_SHEET);
  if (hasGlobal && hasCustom) return;

  // 使用 slice 创建副本以避免副作用，然后推入缺失的样式表
  const next = sheets.slice();
  if (!hasGlobal) next.push(GLOBAL_STYLE_SHEET);
  if (!hasCustom) next.push(CUSTOM_MEMO_STYLE_SHEET);
  root.adoptedStyleSheets = next;
}

/**
 * 为单个元素所在的 Root 注入样式
 * @param target 目标元素
 */
export function ensureStylesForElement(target: HTMLElement) {
  const root = target.getRootNode();
  if (root instanceof ShadowRoot || root instanceof Document) {
    ensureMemoStyleSheets(root);
  }
}

/**
 * 更新自定义 CSS 并重新应用到所有已知的 Root
 * @param css 用户输入的 CSS 字符串
 */
export function setCustomMemoCss(css: string): {
  ok: boolean;
  error?: string;
  ruleCount: number;
} {
  const nextCss = css ?? "";
  try {
    CUSTOM_MEMO_STYLE_SHEET.replaceSync(nextCss);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `未知错误: ${String(error)}`;
    logger.warn("⚠️ 自定义备注 CSS 解析失败:", error);
    return {
      ok: false,
      error: message,
      ruleCount: CUSTOM_MEMO_STYLE_SHEET.cssRules.length,
    };
  }

  applyCustomMemoStyleToExistingRoots();
  return { ok: true, ruleCount: CUSTOM_MEMO_STYLE_SHEET.cssRules.length };
}

/**
 * 扫描页面上已存在的备注元素，对其所在的 ShadowRoot 补打样式补丁
 * 用于 CSS 更新时即时生效
 */
function applyCustomMemoStyleToExistingRoots() {
  const targets = querySelectorAllDeep(MEMO_STYLE_TARGET_SELECTOR);
  if (!targets || targets.length === 0) return;

  const roots = new Set<Document | ShadowRoot>();
  targets.forEach((el) => {
    const root = el.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      roots.add(root);
    }
  });
  roots.forEach((root) => ensureMemoStyleSheets(root));
}

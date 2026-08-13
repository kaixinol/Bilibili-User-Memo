import type { BiliUser } from "../types";
import type {
  PageRule,
} from "@/core/rules/rule-types";
import { containerSelectorList } from "@/core/injection/rule-runtime";
import { logger } from "@/utils/logger";

function readPreferredText(node: HTMLElement | null): string | null {
  if (!node) return null;
  const text = node.textContent?.trim();
  if (text) return text;
  const original = node.dataset.bilimemoOriginal?.trim();
  if (original) {
    logger.warn("⚠️ DOM 文本为空，回退读取 data-bilimemo-original:", original);
    return original;
  }
  return null;
}

function resolveSelfTextTarget(
  el: HTMLElement,
  textSelector: string,
): HTMLElement | null {
  return (
    (el.querySelector(textSelector) as HTMLElement | null) ||
    (el.matches(textSelector) ? el : null)
  );
}

/**
 * 在有 container 的规则中，找到 "当前元素对应的昵称 span"。
 *
 * el 是选择器匹配到的元素：
 *   - 有 aSelector 时，el 是链接元素（如 <a class="up-item">）
 *     需要进一步定位对应的昵称 span
 *   - 没有 aSelector 只有 textSelector 时，el 就是昵称 span 本身
 *     此时 .matches(textSelector) 成立，直接返回 el
 */
function resolveContainerTextTarget(
  el: HTMLElement,
  container: string | string[],
  textSelector: string,
): HTMLElement | null {
  if (el.matches(textSelector)) return el;

  const childTextEl = el.querySelector(textSelector) as HTMLElement | null;
  if (childTextEl) return childTextEl;

  const directContainer = el.closest(containerSelectorList(container));
  if (!directContainer) return null;
  return directContainer.querySelector(textSelector) as HTMLElement | null;
}

/**
 * 解析规则对应的"文本承载节点"。
 */
export function resolveRuleTextTarget(
  el: HTMLElement,
  rule: PageRule,
): HTMLElement | null {
  if (!rule.textSelector) return el;

  if (rule.container) {
    return resolveContainerTextTarget(el, rule.container, rule.textSelector);
  }

  return resolveSelfTextTarget(el, rule.textSelector);
}

/**
 * 获取元素应显示的原始名称。
 */
export function getElementDisplayName(el: HTMLElement, rule: PageRule): string {
  return (
    readPreferredText(resolveRuleTextTarget(el, rule)) ||
    readPreferredText(el) ||
    ""
  );
}

/**
 * 根据显示模式格式化最终文本。
 * displayMode: 0 原名, 1 备注(原名), 2 原名(备注), 3 仅备注
 */
export function formatDisplayName(
  user: BiliUser | undefined,
  fallbackName: string,
  displayMode: number,
): string {
  const nickname = (user?.nickname || fallbackName || "").trim();
  const memo = (user?.memo || "").trim();
  const mentionPrefix = fallbackName.trim().startsWith("@") ? "@" : "";
  const withMentionPrefix = (value: string) =>
    mentionPrefix && !value.startsWith(mentionPrefix)
      ? `${mentionPrefix}${value}`
      : value;

  if (!memo) return withMentionPrefix(nickname);

  switch (displayMode) {
    case 0:
      return withMentionPrefix(nickname);
    case 1:
      return `${withMentionPrefix(memo)}(${nickname})`;
    case 2:
      return `${withMentionPrefix(nickname)}(${memo})`;
    case 3:
      return withMentionPrefix(memo);
    default:
      return withMentionPrefix(nickname);
  }
}

type InputElement = HTMLInputElement | HTMLTextAreaElement;

export function validateInputLength(input: InputElement): boolean {
  const { tooShort, tooLong } = input.validity;
  const { minLength, maxLength, value } = input;

  let errorMessage = "";

  // 原生 tooLong/tooShort 仅在用户编辑后置位，且 maxlength 会封顶用户输入，
  // 打字时值不会 > maxLength，tooLong 几乎无法触发；
  // 因此用 >= 让“恰好打满上限”时也给出提示（该值本身仍是合法输入）。
  if (tooLong || (maxLength > -1 && value.length >= maxLength)) {
    errorMessage = `已达到最大长度：${maxLength} 字符`;
  } else if (tooShort || (minLength > -1 && value.length < minLength)) {
    errorMessage = `至少需要 ${minLength} 个字符`;
  }

  input.setCustomValidity(errorMessage);

  if (errorMessage) {
    // 持续提示：保持 invalid 让原生气泡稳定显示；
    // 配合表单的 novalidate，提交不受原生校验拦截，由调用方 guard 裁决
    input.reportValidity();
    return false;
  }

  return true;
}
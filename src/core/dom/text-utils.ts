import { BiliUser } from "../types/types";
import { DynamicPageRule, PageRule, PollingPageRule } from "../../configs/rules";
import { querySelectorAllDeep } from "query-selector-shadow-dom";

function readPreferredText(node: HTMLElement | null): string | null {
  if (!node) return null;
  const original = node.dataset.biliOriginal?.trim();
  if (original) return original;
  const text = node.textContent?.trim();
  return text || null;
}

function hasWatchTrigger(
  rule: PageRule,
): rule is DynamicPageRule | PollingPageRule {
  return "trigger" in rule;
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

function resolveWatchTextTarget(
  el: HTMLElement,
  rule: DynamicPageRule | PollingPageRule,
  textSelector: string,
): HTMLElement | null {
  // 1) 优先命中“当前元素所属”的 watch 容器，避免多容器串数据
  const directContainer = el.closest(rule.trigger.watch);
  if (directContainer) {
    return directContainer.querySelector(textSelector) as HTMLElement | null;
  }

  // 2) 兜底：遍历 deep 查询结果，找到包含当前元素的容器实例
  const watchTargets = querySelectorAllDeep(rule.trigger.watch);
  for (const target of watchTargets) {
    const scope = target.shadowRoot || target;
    if (scope.contains(el)) {
      return scope.querySelector(textSelector) as HTMLElement | null;
    }
  }

  // 3) 最后兜底：保持原有行为（取第一个）
  const first = watchTargets[0];
  if (!first) return null;
  const fallbackScope = first.shadowRoot || first;
  return fallbackScope.querySelector(textSelector) as HTMLElement | null;
}

/**
 * 解析规则对应的“文本承载节点”。
 */
export function resolveRuleTextTarget(
  el: HTMLElement,
  rule: PageRule,
): HTMLElement | null {
  if (!rule.textSelector) return el;

  if (rule.textSource !== "watch") {
    return resolveSelfTextTarget(el, rule.textSelector);
  }

  if (!hasWatchTrigger(rule)) return null;
  return resolveWatchTextTarget(el, rule, rule.textSelector);
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

  if (!memo) return nickname;

  switch (displayMode) {
    case 0:
      return nickname;
    case 1:
      return `${memo}(${nickname})`;
    case 2:
      return `${nickname}(${memo})`;
    case 3:
      return memo;
    default:
      return nickname;
  }
}

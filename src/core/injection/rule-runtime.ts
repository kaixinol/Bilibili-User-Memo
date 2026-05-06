import { unsafeWindow } from "$";
import {
  isDynamicMode,
  isStaticMode,
} from "@/core/rules/rule-types";
import type {
  DynamicPageRule,
  PageRule,
  StaticPageRule,
} from "@/core/rules/rule-types";
import { config } from "@/core/rules/rules";
import { logger } from "@/utils/logger";

export interface RuleGroups {
  staticRules: StaticPageRule[];
  dynamicRules: DynamicPageRule[];
}

export function getMatchedRules(currentUrl = unsafeWindow.location.href): PageRule[] {
  return config
    .filter((entry) => entry.urlPattern.test(currentUrl))
    .map((entry) => entry.rule);
}

export function groupRulesByMode(rules: PageRule[]): RuleGroups {
  return rules.reduce<RuleGroups>(
    (groups, rule) => {
      if (isStaticMode(rule)) {
        groups.staticRules.push(rule);
      } else if (isDynamicMode(rule)) {
        groups.dynamicRules.push(rule);
      }

      return groups;
    },
    {
      staticRules: [],
      dynamicRules: [],
    },
  );
}

export function getMatchByNameRules(rules: Iterable<PageRule>): PageRule[] {
  return Array.from(rules).filter((rule) => Boolean(rule.matchByName));
}

export function buildRuleSelector(rule: PageRule): string | null {
  const baseSelector = rule.aSelector || rule.textSelector;
  if (!baseSelector) return null;
  return `${baseSelector}:not([data-bili-processed])`;
}

export function logRuleScanResult(
  rule: PageRule,
  selector: string,
  count: number,
) {
  if (count === 0) return;

  if (isStaticMode(rule)) {
    logger.debug(`💉 静态注入: 找到 ${count} 个目标元素 [${selector}]`);
    return;
  }
}

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

export function getMatchedRules(currentUrl = location.href): PageRule[] {
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
  return rule.aSelector || rule.textSelector || null;
}

function buildMultiTargetSelector(rule: PageRule): string | null {
  if (!isDynamicMode(rule) || !rule.multiTarget) return null;
  const watch = rule.trigger.watch;
  const parts = [rule.aSelector, rule.textSelector]
    .filter((s): s is string => Boolean(s))
    .map((el) => `${watch} ${el}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

export function buildMergedSelector(rules: PageRule[]): string | null {
  const selectors = rules
    .map((r) =>
      isDynamicMode(r) && r.multiTarget
        ? buildMultiTargetSelector(r)
        : buildRuleSelector(r),
    )
    .filter((s): s is string => s !== null);
  const unique = [...new Set(selectors)];
  return unique.length > 0 ? unique.join(", ") : null;
}

export function getSingleTargetDynamicRules(
  rules: DynamicPageRule[],
): DynamicPageRule[] {
  return rules.filter((r) => !r.multiTarget);
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

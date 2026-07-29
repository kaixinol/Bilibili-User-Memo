import type {
  PageRule,
  RawRule,
} from "@/core/rules/rule-types";
import { config } from "@/core/rules/rules";
import { logger } from "@/utils/logger";

export function getMatchedRules(currentUrl = location.href): RawRule[] {
  return config
    .filter((entry) => entry.urlPattern.test(currentUrl))
    .map((entry) => entry.rule);
}

export function getMatchByNameRules(rules: Iterable<PageRule>): PageRule[] {
  return Array.from(rules).filter((rule) => Boolean(rule.matchByName));
}

function buildRuleSelector(rule: PageRule): string | null {
  return rule.aSelector || rule.textSelector || null;
}

export function buildMergedSelector(rules: PageRule[]): string | null {
  const selectors = rules
    .map((r) => {
      const sel = buildRuleSelector(r);
      if (!sel) return null;
      return r.container ? `${r.container} ${sel}` : sel;
    })
    .filter((s): s is string => s !== null);
  const unique = [...new Set(selectors)];
  return unique.length > 0 ? unique.join(", ") : null;
}

export function logRuleScanResult(
  _rule: PageRule,
  selector: string,
  count: number,
) {
  if (count === 0) return;
  logger.debug(`💉 注入: 找到 ${count} 个目标元素 [${selector}]`);
}

export { buildRuleSelector };

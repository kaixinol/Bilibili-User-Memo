import type {
  PageRule,
  RawRule,
} from "@/core/rules/rule-types";
import { config } from "@/core/rules/rules";

export function getMatchedRules(currentUrl = location.href): RawRule[] {
  return config
    .filter((entry) => entry.urlPattern.test(currentUrl))
    .map((entry) => entry.rule);
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

export { buildRuleSelector };

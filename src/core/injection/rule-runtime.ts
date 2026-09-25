import type {
  PageRule,
  RawConfig,
  RawRule,
} from "@/core/rules/rule-types";
import { config } from "@/core/rules/rules";

export function getMatchedRuleConfigs(
  currentUrl = location.href,
): RawConfig[] {
  return config.filter((entry) => entry.urlPattern.test(currentUrl));
}

export function getMatchedRules(currentUrl = location.href): RawRule[] {
  return getMatchedRuleConfigs(currentUrl).map((entry) => entry.rule);
}


function buildRuleSelector(rule: PageRule): string | null {
  return rule.aSelector || rule.textSelector || null;
}

function expandContainer(container?: string | string[]): string[] {
  return container ? (Array.isArray(container) ? container : [container]) : [];
}

export function containerSelectorList(container?: string | string[]): string {
  return expandContainer(container).join(", ");
}

export function buildMergedSelector(rules: PageRule[]): string | null {
  const selectors = rules
    .flatMap((r) => {
      const sel = buildRuleSelector(r);
      if (!sel) return [];
      const containers = expandContainer(r.container);
      if (containers.length === 0) return [sel];
      return containers.map((c) => `${c} ${sel}`);
    });
  const unique = [...new Set(selectors)];
  return unique.length > 0 ? unique.join(", ") : null;
}

export { buildRuleSelector };

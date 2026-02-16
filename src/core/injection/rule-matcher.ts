import { config, PageRule } from "../../configs/rules";

export function getMatchedRulesByUrl(currentUrl: string): PageRule[] {
  return config
    .filter((entry) => entry.urlPattern.test(currentUrl))
    .map((entry) => entry.rule);
}

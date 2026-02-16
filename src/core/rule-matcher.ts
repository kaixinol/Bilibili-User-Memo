import { config, PageRule } from "../configs/rules";

export function getMatchedRulesByUrl(currentUrl: string): PageRule[] {
  return Array.from(config.entries())
    .filter(([pattern]) => pattern.test(currentUrl))
    .map(([_, rule]) => rule);
}

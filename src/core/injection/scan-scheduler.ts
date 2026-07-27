import type {
  DynamicPageRule,
  PageRule,
} from "@/core/rules/rule-types";
import type { ScanScope } from "./scan-scope";

export class RuleScanScheduler {
  private readonly ruleDebounceTimers = new Map<
    DynamicPageRule,
    Map<ScanScope, number>
  >();

  constructor(
    private readonly processRule: (
      rule: PageRule,
      scope: ScanScope,
    ) => Promise<void>,
  ) {}

  public scanRules(
    rules: PageRule[],
    scope: ScanScope,
  ) {
    if (rules.length === 0) return;
    for (const rule of rules) {
      void this.processRule(rule, scope);
    }
  }

  public scheduleDynamicRuleScan(
    rule: DynamicPageRule,
    delay: number,
    scope: ScanScope,
  ) {
    let scopeTimers = this.ruleDebounceTimers.get(rule);
    if (!scopeTimers) {
      scopeTimers = new Map<ScanScope, number>();
      this.ruleDebounceTimers.set(rule, scopeTimers);
    }

    const existingTimer = scopeTimers.get(scope);
    if (existingTimer) {
      return;
    }

    const timerId = window.setTimeout(() => {
      const activeScopeTimers = this.ruleDebounceTimers.get(rule);
      activeScopeTimers?.delete(scope);
      if (activeScopeTimers && activeScopeTimers.size === 0) {
        this.ruleDebounceTimers.delete(rule);
      }
      this.scanRules([rule], scope);
    }, delay);

    scopeTimers.set(scope, timerId);
  }

  public clearRuleDebounceTimers(rule: DynamicPageRule) {
    const scopeTimers = this.ruleDebounceTimers.get(rule);
    if (!scopeTimers) return;

    scopeTimers.forEach((timerId) => clearTimeout(timerId));
    this.ruleDebounceTimers.delete(rule);
  }
}

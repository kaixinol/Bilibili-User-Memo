import type {
  DynamicPageRule,
  PageRule,
  StaticPageRule,
} from "@/core/rules/rules";
import { requestIdle } from "@/utils/scheduler";
import type { ScanScope } from "./scan-scope";
import {
  getScopeType,
  recordFlowDiagnostic,
} from "@/utils/perf-diagnostics";

export class RuleScanScheduler {
  private staticRetryTimers: number[] = [];
  private staticRetryToken = 0;
  private readonly ruleDebounceTimers = new Map<
    DynamicPageRule,
    Map<ScanScope, number>
  >();

  constructor(
    private readonly scanRule: (rule: PageRule, scope: ScanScope) => Promise<void>,
    private readonly isActive: () => boolean,
  ) {}

  public dispose() {
    this.clearStaticRuleRetries();
    for (const rule of this.ruleDebounceTimers.keys()) {
      this.clearRuleDebounceTimers(rule);
    }
  }

  public scanRules(rules: PageRule[], scope: ScanScope, source = "scan rules") {
    if (rules.length === 0) return;

    const queue = [...rules];
    const runChunk = (deadline: IdleDeadline) => {
      const processQueue = async () => {
        const chunkStart = __IS_DEBUG__ ? performance.now() : 0;
        let processedRules = 0;
        while (queue.length > 0 && deadline.timeRemaining() > 1) {
          const rule = queue.shift();
          if (!rule) continue;
          await this.scanRule(rule, scope);
          processedRules += 1;
        }

        if (__IS_DEBUG__ && processedRules > 0) {
          recordFlowDiagnostic({
            source,
            scopeType: getScopeType(scope),
            ruleCount: processedRules,
            durationMs: performance.now() - chunkStart,
            chunked: queue.length > 0,
          });
        }

        if (queue.length > 0) {
          requestIdle(runChunk);
        }
      };

      void processQueue();
    };

    requestIdle(runChunk);
  }

  public scheduleStaticRuleRetries(staticRules: StaticPageRule[], scope: ScanScope) {
    this.clearStaticRuleRetries();
    if (staticRules.length === 0) return;

    const token = ++this.staticRetryToken;
    const retryDelays = [350, 900];

    retryDelays.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (!this.isActive() || token !== this.staticRetryToken) return;
        this.scanRules(staticRules, scope, `static retry ${delay}ms`);
      }, delay);
      this.staticRetryTimers.push(timerId);
    });
  }

  public clearStaticRuleRetries() {
    this.staticRetryToken++;
    this.staticRetryTimers.forEach((timerId) => clearTimeout(timerId));
    this.staticRetryTimers = [];
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
      clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      const activeScopeTimers = this.ruleDebounceTimers.get(rule);
      activeScopeTimers?.delete(scope);
      if (activeScopeTimers && activeScopeTimers.size === 0) {
        this.ruleDebounceTimers.delete(rule);
      }
      this.scanRules([rule], scope, "dynamic debounce");
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

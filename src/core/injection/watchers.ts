import {
  type DynamicPageRule,
  getInjectMode,
  DYNAMIC_SCAN_INTERVAL_MS,
} from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import {
  getScopeType,
  recordFlowDiagnostic,
} from "@/utils/perf-diagnostics";
import { getWatchTarget, resolveWatchScope } from "./watch-runtime";
import type { ScanScope } from "./scan-scope";

export class DynamicRuleWatcher {
  private pollTimer: number | null = null;

  constructor(
    public readonly rule: DynamicPageRule,
    private onTrigger: (rule: DynamicPageRule, root: ScanScope) => void,
  ) {}

  public start() {
    logger.debug(
      `📡 启动动态轮询: [${this.rule.name}] watch=${this.rule.trigger.watch}`,
    );

    this.poll();

    this.pollTimer = window.setInterval(() => {
      this.poll();
    }, DYNAMIC_SCAN_INTERVAL_MS);
  }

  public stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private poll() {
    const target = getWatchTarget(this.rule.trigger.watch);
    if (!target) return;

    const scope = resolveWatchScope(target);

    if (__IS_DEBUG__) {
      recordFlowDiagnostic({
        source: "dynamic poll",
        ruleName: this.rule.name,
        mode: getInjectMode(this.rule),
        scopeType: getScopeType(scope),
      });
    }

    this.onTrigger(this.rule, scope);
  }
}

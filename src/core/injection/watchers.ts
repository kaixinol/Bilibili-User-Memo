import {
  type DynamicPageRule,
  getInjectMode,
} from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import {
  getScopeType,
  recordFlowDiagnostic,
} from "@/utils/perf-diagnostics";
import {
  getWatchTarget,
  getWatchTargets,
  resolveWatchScope,
  shouldHandleDiscoveryMutations,
} from "./watch-runtime";
import type { ScanScope } from "./scan-scope";
import { requestIdle } from "@/utils/scheduler";

interface InstanceObserverRecord {
  observer: MutationObserver;
  scope: ScanScope;
}

export class DynamicRuleWatcher {
  // Legacy Mode (dynamicWatch = false): Single target management
  private legacyObserver: MutationObserver | null = null;
  private legacyPollTimer: number | null = null;
  private legacyIdlePending = false;

  // Global Mode (dynamicWatch = true): Multi-target management
  private instanceObservers = new Map<HTMLElement, InstanceObserverRecord>();
  private periodicScanTimer: number | null = null;

  constructor(
    public readonly rule: DynamicPageRule,
    private onTrigger: (rule: DynamicPageRule, root: ScanScope) => void,
  ) {}

  public start() {
    if (this.rule.dynamicWatch) {
      this.startGlobalWatch();
    } else {
      this.tryAttachOrPollLegacy();
    }
  }

  public stop() {
    // Stop Legacy
    if (this.legacyPollTimer) {
      clearInterval(this.legacyPollTimer);
      this.legacyPollTimer = null;
    }
    if (this.legacyObserver) {
      this.legacyObserver.disconnect();
      this.legacyObserver = null;
    }
    this.legacyIdlePending = false;

    // Stop Global
    if (this.periodicScanTimer) {
      clearInterval(this.periodicScanTimer);
      this.periodicScanTimer = null;
    }
    this.instanceObservers.forEach(({ observer }) => observer.disconnect());
    this.instanceObservers.clear();
  }

  // ==========================================================
  // 模式 A: Dynamic Watch — 周期性深度扫描 + instance observer
  // ==========================================================

  private startGlobalWatch() {
    logger.debug(
      `📡 启动动态全域监听: [${this.rule.name}] watch=${this.rule.trigger.watch}`,
    );

    this.scanAndAttachNewTargets();
    this.startPeriodicScan();
  }

  private scanAndAttachNewTargets() {
    const targets = getWatchTargets(this.rule.trigger.watch);
    if (targets.length === 0) return;

    targets.forEach((target) => {
      const scope = resolveWatchScope(target);
      const current = this.instanceObservers.get(target);

      if (!current) {
        logger.debug(`🔭 [${this.rule.name}] 捕获新容器实例`, target);
        this.attachInstanceWatcher(target, scope);
        return;
      }

      if (current.scope !== scope) {
        logger.debug(
          `🔁 [${this.rule.name}] 容器作用域切换，重绑监听`,
          target,
        );
        current.observer.disconnect();
        this.attachInstanceWatcher(target, scope);
      }
    });
  }

  private createScopeObserver(scope: ScanScope): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      if (!shouldHandleDiscoveryMutations(mutations).hasAddedNodes) return;
      this.onTrigger(this.rule, scope);
    });
    observer.observe(scope, { childList: true, subtree: true });
    return observer;
  }

  private attachInstanceWatcher(keyNode: HTMLElement, scope: ScanScope) {
    const observer = this.createScopeObserver(scope);
    this.instanceObservers.set(keyNode, { observer, scope });

    if (__IS_DEBUG__) {
      recordFlowDiagnostic({
        source: "dynamic attach",
        ruleName: this.rule.name,
        mode: getInjectMode(this.rule),
        scopeType: getScopeType(scope),
      });
    }
    this.onTrigger(this.rule, scope);
  }

  /**
   * 周期性深度扫描：每 interval ms 清理已销毁容器并扫描新容器。
   * scanAndAttachNewTargets 内部对已存在的 target 有幂等拦截，开销极低。
   * querySelectorAllDeep 会穿透 shadow DOM 查找元素，无需手动观察每个 shadow root。
   */
  private startPeriodicScan() {
    this.periodicScanTimer = window.setInterval(() => {
      for (const [target, { observer }] of this.instanceObservers.entries()) {
        if (!target.isConnected) {
          observer.disconnect();
          this.instanceObservers.delete(target);
        }
      }

      this.scanAndAttachNewTargets();

      for (const { scope } of this.instanceObservers.values()) {
        this.onTrigger(this.rule, scope);
      }
    }, this.rule.trigger.interval);
  }

  // ==========================================================
  // 模式 B: Legacy (旧模式 - 只找一个目标，找不到就轮询)
  // ==========================================================

  private tryAttachOrPollLegacy() {
    if (this.attachLegacy()) return;

    if (!this.legacyPollTimer) {
      this.legacyPollTimer = window.setInterval(() => {
        if (this.attachLegacy()) {
          if (this.legacyPollTimer) clearInterval(this.legacyPollTimer);
          this.legacyPollTimer = null;
          logger.debug(`👀 规则 [${this.rule.name}] 监听器挂载成功`);
        }
      }, this.rule.trigger.interval * 2);
    }
  }

  private attachLegacy(): boolean {
    const watchTarget = getWatchTarget(this.rule.trigger.watch);
    if (!watchTarget) return false;

    const scope = resolveWatchScope(watchTarget);
    this.legacyObserver = this.createIdleLegacyObserver(scope);

    if (__IS_DEBUG__) {
      recordFlowDiagnostic({
        source: "dynamic legacy attach",
        ruleName: this.rule.name,
        mode: getInjectMode(this.rule),
        scopeType: getScopeType(scope),
      });
    }
    this.onTrigger(this.rule, scope);
    return true;
  }

  private createIdleLegacyObserver(scope: ScanScope): MutationObserver {
    const scheduleTrigger = () => {
      if (this.legacyIdlePending) return;
      this.legacyIdlePending = true;
      requestIdle(() => {
        this.legacyIdlePending = false;
        if (__IS_DEBUG__) {
          recordFlowDiagnostic({
            source: "dynamic legacy idle",
            ruleName: this.rule.name,
            mode: getInjectMode(this.rule),
            scopeType: getScopeType(scope),
          });
        }
        this.onTrigger(this.rule, scope);
      }, this.rule.trigger.interval);
    };

    const observer = new MutationObserver((mutations) => {
      if (!shouldHandleDiscoveryMutations(mutations).hasAddedNodes) return;
      scheduleTrigger();
    });
    observer.observe(scope, { childList: true, subtree: true });
    return observer;
  }
}

import { type DynamicPageRule, type PollingPageRule } from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import {
  getScopeType,
  recordFlowDiagnostic,
} from "@/utils/perf-diagnostics";
import {
  getWatchTarget,
  getWatchTargets,
  isNodeInsideScope,
  resolveWatchScope,
  shouldHandleDiscoveryMutations,
  type DiscoveryScope,
} from "./watch-runtime";
import type { ScanScope } from "./scan-scope";
import { requestIdle } from "@/utils/scheduler";

interface InstanceObserverRecord {
  observer: MutationObserver;
  scope: ScanScope;
}

export class DynamicRuleWatcher {
  private static originalAttachShadow = Element.prototype.attachShadow;
  private static attachShadowPatched = false;
  private static attachShadowListeners = new Set<
    (shadowRoot: ShadowRoot) => void
  >();

  // Legacy Mode (dynamicWatch = false): Single target management
  private legacyObserver: MutationObserver | null = null;
  private legacyPollTimer: number | null = null;
  private legacyIdlePending = false;

  // Global Mode (dynamicWatch = true): Multi-target management
  private discoveryObservers = new Map<DiscoveryScope, MutationObserver>();
  private instanceObservers = new Map<HTMLElement, InstanceObserverRecord>();
  private readonly instanceIdlePending = new WeakSet<HTMLElement>();
  private readonly handleShadowAttached = (shadowRoot: ShadowRoot) => {
    this.observeDiscoveryScope(shadowRoot);
    this.scanAndAttachNewTargets();
  };

  constructor(
    public readonly rule: DynamicPageRule, // 公开 rule 以便 Map 索引比对
    private onTrigger: (rule: DynamicPageRule, root: ScanScope) => void,
  ) { }

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
    this.unregisterAttachShadowListener();
    this.discoveryObservers.forEach((observer) => observer.disconnect());
    this.discoveryObservers.clear();
    this.instanceObservers.forEach(({ observer }) => observer.disconnect());
    this.instanceObservers.clear();
  }

  // ==========================================================
  // 模式 A: Dynamic Watch (新模式 - 持续监听 DOM 变化以发现 watch 目标)
  // ==========================================================

  private startGlobalWatch() {
    logger.debug(
      `📡 启动动态全域监听: [${this.rule.name}] watch=${this.rule.trigger.watch}`,
    );

    this.registerAttachShadowListener();

    // 1. 监听 document 与所有可达的 open shadowRoot
    this.observeDiscoveryScope(document);

    // 2. 立即扫描现有的目标
    this.scanAndAttachNewTargets();
  }

  private static ensureAttachShadowPatched() {
    if (DynamicRuleWatcher.attachShadowPatched) return;

    const originalAttachShadow = DynamicRuleWatcher.originalAttachShadow;
    Element.prototype.attachShadow = function (
      this: Element,
      init: ShadowRootInit,
    ): ShadowRoot {
      const shadowRoot = originalAttachShadow.call(this, init);
      for (const listener of DynamicRuleWatcher.attachShadowListeners) {
        try {
          listener(shadowRoot);
        } catch (error) {
          logger.debug("attachShadow listener error", error);
        }
      }
      return shadowRoot;
    };

    DynamicRuleWatcher.attachShadowPatched = true;
  }

  private registerAttachShadowListener() {
    DynamicRuleWatcher.ensureAttachShadowPatched();
    DynamicRuleWatcher.attachShadowListeners.add(this.handleShadowAttached);
  }

  private unregisterAttachShadowListener() {
    DynamicRuleWatcher.attachShadowListeners.delete(this.handleShadowAttached);
  }

  private observeDiscoveryScope(scope: DiscoveryScope) {
    if (this.discoveryObservers.has(scope)) return;

    const observer = new MutationObserver((mutations) => {
      const { hasAddedNodes, hasRemovedNodes } =
        shouldHandleDiscoveryMutations(mutations);

      if (hasAddedNodes) {
        this.scanAndAttachNewTargets();
        this.bridgeShadowMutationsToWatchScopes(scope);
      }

      if (hasRemovedNodes) {
        this.cleanupDetachedTargets();
        this.cleanupDetachedDiscoveryScopes();
      }
    });

    observer.observe(scope, { childList: true, subtree: true });
    this.discoveryObservers.set(scope, observer);

    this.discoverShadowScopes(scope);
  }

  private discoverShadowScopes(scope: DiscoveryScope) {
    scope
      .querySelectorAll("*")
      .forEach((element) => this.observeHostShadowScope(element));
  }

  private observeHostShadowScope(element: Element) {
    const shadowRoot = element.shadowRoot;
    if (shadowRoot) {
      this.observeDiscoveryScope(shadowRoot);
    }
  }

  private scanAndAttachNewTargets() {
    const targets = getWatchTargets(this.rule.trigger.watch);
    if (targets.length === 0) return;

    targets.forEach((target) => {
      const scope = resolveWatchScope(target);
      const keyNode = target;
      const current = this.instanceObservers.get(keyNode);

      if (!current) {
        logger.debug(`🔭 [${this.rule.name}] 捕获新容器实例`, target);
        this.attachInstanceWatcher(keyNode, scope);
        return;
      }

      if (current.scope !== scope) {
        logger.debug(
          `🔁 [${this.rule.name}] 容器作用域切换，重绑监听`,
          target,
        );
        current.observer.disconnect();
        this.attachInstanceWatcher(keyNode, scope);
      }
    });
  }

  private createScopeObserver(keyNode: HTMLElement, scope: ScanScope): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      if (!shouldHandleDiscoveryMutations(mutations).hasAddedNodes) return;
      if (this.instanceIdlePending.has(keyNode)) return;
      this.instanceIdlePending.add(keyNode);
      this.onTrigger(this.rule, scope);
      this.instanceIdlePending.delete(keyNode);
    });
    observer.observe(scope, { childList: true, subtree: true });
    return observer;
  }

  /**
   * ShadowRoot 内部新增节点不会冒泡到其宿主元素的 childList 观察器。
   * 因此在 discovery 层发现 shadow 变更时，桥接到对应 watch 容器触发扫描。
   * 仅处理新增节点的场景；去重由 scheduler 的 pendingQueue 保证。
   */
  private bridgeShadowMutationsToWatchScopes(scope: DiscoveryScope) {
    if (!(scope instanceof ShadowRoot)) return;
    if (this.instanceObservers.size === 0) return;

    for (const { scope: watchScope } of this.instanceObservers.values()) {
      if (watchScope instanceof ShadowRoot && watchScope === scope) continue;
      if (!isNodeInsideScope(scope, watchScope)) continue;
      if (__IS_DEBUG__) {
        recordFlowDiagnostic({
          source: "dynamic shadow bridge",
          ruleName: this.rule.name,
          mode: this.rule.injectMode,
          scopeType: getScopeType(watchScope),
        });
      }
      this.onTrigger(this.rule, watchScope);
    }
  }

  private attachInstanceWatcher(keyNode: HTMLElement, scope: ScanScope) {
    const observer = this.createScopeObserver(keyNode, scope);
    this.instanceObservers.set(keyNode, { observer, scope });

    // 首次挂载成功，立即执行一次局部扫描
    if (__IS_DEBUG__) {
      recordFlowDiagnostic({
        source: "dynamic attach",
        ruleName: this.rule.name,
        mode: this.rule.injectMode,
        scopeType: getScopeType(scope),
      });
    }
    this.onTrigger(this.rule, scope);
  }

  /**
   * 清理已经从 DOM 中移除的元素的监听器
   * 防止内存泄漏
   */
  private cleanupDetachedTargets() {
    for (const [node, { observer }] of this.instanceObservers) {
      // document.contains(node) 对 Shadow DOM 内节点会误判为 false
      // isConnected 能正确反映"是否仍连接在文档树（含 shadow tree）"
      if (!node.isConnected) {
        logger.debug(`🗑️ [${this.rule.name}] 容器已销毁，移除监听器`);
        observer.disconnect();
        this.instanceObservers.delete(node);
      }
    }
  }

  private cleanupDetachedDiscoveryScopes() {
    for (const [scope, observer] of this.discoveryObservers) {
      if (scope === document) continue;
      if (!scope.isConnected) {
        observer.disconnect();
        this.discoveryObservers.delete(scope);
      }
    }
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
      }, this.rule.trigger.interval * 2); // 轮询间隔设为 debounce 的两倍，减少空转
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
        mode: this.rule.injectMode,
        scopeType: getScopeType(scope),
      });
    }
    this.onTrigger(this.rule, scope);
    return true;
  }

  /**
   * Legacy 模式专用 observer：mutation 后空闲时触发，最高 500ms 触发一次
   */
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
            mode: this.rule.injectMode,
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

export class PollingRuleWatcher {
  private pollTimer: number | null = null;

  constructor(
    public readonly rule: PollingPageRule,
    private onTrigger: (rule: PollingPageRule, root: ScanScope) => void,
  ) { }

  public start() {
    logger.debug(
      `⏱️ 轮询规则启动: [${this.rule.name}] interval=${this.rule.trigger.interval}ms watch=${this.rule.trigger.watch}`,
    );
    this.tick();
    this.pollTimer = window.setInterval(
      () => this.tick(),
      this.rule.trigger.interval,
    );
  }

  public stop() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    logger.debug(`🛑 轮询规则停止: [${this.rule.name}]`);
  }

  private tick() {
    const watchTarget = getWatchTarget(this.rule.trigger.watch);
    if (!watchTarget) return;
    const scope = resolveWatchScope(watchTarget);
    if (__IS_DEBUG__) {
      recordFlowDiagnostic({
        source: "polling tick",
        ruleName: this.rule.name,
        mode: this.rule.injectMode,
        scopeType: getScopeType(scope),
      });
    }
    this.onTrigger(this.rule, scope);
  }
}

import {
  querySelectorAllDeep,
  querySelectorDeep,
} from "query-selector-shadow-dom";
import { DynamicPageRule, PollingPageRule } from "../../configs/rules";
import { logger } from "../../utils/logger";

type WatchScope = HTMLElement | ShadowRoot | Document;

function resolveWatchScope(target: HTMLElement): WatchScope {
  return target.shadowRoot || target;
}

function hasAddedNodes(mutations: MutationRecord[]): boolean {
  return mutations.some((m) => m.addedNodes.length > 0);
}

export class DynamicRuleWatcher {
  // Legacy Mode (dynamicWatch = false): Single target management
  private legacyObserver: MutationObserver | null = null;
  private legacyPollTimer: number | null = null;

  // Global Mode (dynamicWatch = true): Multi-target management
  private globalObserver: MutationObserver | null = null;
  private instanceObservers = new Map<Node, MutationObserver>();

  constructor(
    public readonly rule: DynamicPageRule, // 公开 rule 以便 Map 索引比对
    private onTrigger: (rule: DynamicPageRule, root: WatchScope) => void,
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

    // Stop Global
    if (this.globalObserver) {
      this.globalObserver.disconnect();
      this.globalObserver = null;
    }
    this.instanceObservers.forEach((obs) => obs.disconnect());
    this.instanceObservers.clear();
  }

  // ==========================================================
  // 模式 A: Dynamic Watch (新模式 - 持续监听 DOM 变化以发现 watch 目标)
  // ==========================================================

  private startGlobalWatch() {
    logger.debug(
      `📡 启动动态全域监听: [${this.rule.name}] watch=${this.rule.trigger.watch}`,
    );

    // 1. 立即扫描现有的目标
    this.scanAndAttachNewTargets();

    // 2. 监听 document.body 寻找新出现的目标
    // 注意：监听整个 body subtree 有性能成本，但对于捕捉动态容器是必须的
    this.globalObserver = new MutationObserver((mutations) => {
      let needScan = false;
      let nodesRemoved = false;

      // 粗略过滤：只有当有节点增删时才尝试去 querySelector
      for (const m of mutations) {
        if (m.addedNodes.length > 0) needScan = true;
        if (m.removedNodes.length > 0) nodesRemoved = true;
      }

      if (needScan) {
        this.scanAndAttachNewTargets();
      }

      if (nodesRemoved) {
        this.cleanupDetachedTargets();
      }
    });

    this.globalObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private scanAndAttachNewTargets() {
    // 查找所有符合 watch 选择器的元素
    const targets = querySelectorAllDeep(this.rule.trigger.watch);

    targets.forEach((target) => {
      // 如果这个元素还没有被监听，则挂载
      const scope = resolveWatchScope(target); // 优先监听 ShadowRoot
      const keyNode = target; // 使用元素本身作为 Map 的 Key

      if (!this.instanceObservers.has(keyNode)) {
        logger.debug(`🔭 [${this.rule.name}] 捕获新容器实例`, target);
        this.attachInstanceWatcher(keyNode, scope);
      }
    });
  }

  private createScopeObserver(scope: WatchScope): MutationObserver {
    const observer = new MutationObserver((mutations) => {
      if (!hasAddedNodes(mutations)) return;
      this.onTrigger(this.rule, scope);
    });
    observer.observe(scope, { childList: true, subtree: true });
    return observer;
  }

  private attachInstanceWatcher(keyNode: Node, scope: WatchScope) {
    const observer = this.createScopeObserver(scope);
    this.instanceObservers.set(keyNode, observer);

    // 首次挂载成功，立即执行一次局部扫描
    this.onTrigger(this.rule, scope);
  }

  /**
   * 清理已经从 DOM 中移除的元素的监听器
   * 防止内存泄漏
   */
  private cleanupDetachedTargets() {
    for (const [node, observer] of this.instanceObservers) {
      // document.contains(node) 对 Shadow DOM 内节点会误判为 false
      // isConnected 能正确反映“是否仍连接在文档树（含 shadow tree）”
      if (!node.isConnected) {
        logger.debug(`🗑️ [${this.rule.name}] 容器已销毁，移除监听器`);
        observer.disconnect();
        this.instanceObservers.delete(node);
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
      }, 800); // 稍微放宽轮询间隔，减少空转消耗
    }
  }

  private attachLegacy(): boolean {
    const watchTarget = querySelectorDeep(this.rule.trigger.watch);
    if (!watchTarget) return false;

    const scope = resolveWatchScope(watchTarget);
    this.legacyObserver = this.createScopeObserver(scope);

    // 首次挂载成功，立即执行一次局部扫描
    this.onTrigger(this.rule, scope);
    return true;
  }
}

export class PollingRuleWatcher {
  private pollTimer: number | null = null;

  constructor(
    public readonly rule: PollingPageRule,
    private onTrigger: (rule: PollingPageRule, root: WatchScope) => void,
  ) {}

  public start() {
    logger.debug(
      `⏱️ 轮询规则启动: [${this.rule.name}] interval=${this.rule.trigger.intervalMs}ms watch=${this.rule.trigger.watch}`,
    );
    this.tick();
    this.pollTimer = window.setInterval(
      () => this.tick(),
      this.rule.trigger.intervalMs,
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
    const watchTarget = querySelectorDeep(this.rule.trigger.watch);
    if (!watchTarget) return;
    const scope = resolveWatchScope(watchTarget);
    this.onTrigger(this.rule, scope);
  }
}

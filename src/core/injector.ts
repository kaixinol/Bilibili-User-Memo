// src/core/injector.ts
import {
  querySelectorAllDeep,
  querySelectorDeep,
} from "query-selector-shadow-dom";
import {
  config,
  InjectionMode,
  PageRule,
  DynamicPageRule,
  PollingPageRule,
} from "../configs/rules";
import { logger } from "../utils/logger";
import { sleep } from "../utils/sleep";
import { userStore } from "./store";
import {
  extractUid,
  getElementDisplayName,
  formatDisplayName,
} from "./dom-utils";
import { injectMemoRenderer } from "./renderer";

/**
 * 动态规则观察者
 * 职责：管理单个或多个规则目标的生命周期
 * 升级：支持 dynamicWatch 模式，可同时管理多个 watch 目标的监听（如动态加载的评论区列表）
 */
class DynamicRuleWatcher {
  // Legacy Mode (dynamicWatch = false): Single target management
  private legacyObserver: MutationObserver | null = null;
  private legacyPollTimer: number | null = null;

  // Global Mode (dynamicWatch = true): Multi-target management
  private globalObserver: MutationObserver | null = null;
  private instanceObservers = new Map<Node, MutationObserver>();

  constructor(
    public readonly rule: DynamicPageRule, // 公开 rule 以便 Map 索引比对
    private onTrigger: (
      rule: DynamicPageRule,
      root: HTMLElement | ShadowRoot | Document,
    ) => void,
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

    // logger.debug(`🛑 规则 [${this.rule.name}] 停止监听`);
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
      const scope = target.shadowRoot || target; // 优先监听 ShadowRoot
      const keyNode = target; // 使用元素本身作为 Map 的 Key

      if (!this.instanceObservers.has(keyNode)) {
        logger.debug(`🔭 [${this.rule.name}] 捕获新容器实例`, target);
        this.attachInstanceWatcher(keyNode, scope);
      }
    });
  }

  private attachInstanceWatcher(keyNode: Node, scope: Node) {
    const observer = new MutationObserver((mutations) => {
      const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (hasAddedNodes) {
        // 将 scope 传回 Injector，实现局部扫描
        this.onTrigger(this.rule, scope as HTMLElement | ShadowRoot | Document);
      }
    });

    observer.observe(scope, {
      childList: true,
      subtree: true,
    });

    // 保存引用
    this.instanceObservers.set(keyNode, observer);

    // 首次挂载成功，立即执行一次局部扫描
    this.onTrigger(this.rule, scope as HTMLElement | ShadowRoot | Document);
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
      // logger.debug(`⚠️ 规则 [${this.rule.name}] 等待目标容器...`);
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

    // 关键优化：确定监听范围 (优先 ShadowRoot)
    const scope = watchTarget.shadowRoot || watchTarget;

    this.legacyObserver = new MutationObserver((mutations) => {
      // 只有当有节点增加时才触发扫描
      const hasAddedNodes = mutations.some((m) => m.addedNodes.length > 0);
      if (hasAddedNodes) {
        // 将 scope 传回 Injector，实现局部扫描
        this.onTrigger(this.rule, scope);
      }
    });

    this.legacyObserver.observe(scope, {
      childList: true,
      subtree: true,
    });

    // 首次挂载成功，立即执行一次局部扫描
    this.onTrigger(this.rule, scope);
    return true;
  }
}

/**
 * 輪詢規則執行器
 * 職責：定時掃描指定容器 (不依賴 MutationObserver)
 */
class PollingRuleWatcher {
  private pollTimer: number | null = null;

  constructor(
    public readonly rule: PollingPageRule,
    private onTrigger: (
      rule: PollingPageRule,
      root: HTMLElement | ShadowRoot | Document,
    ) => void,
  ) {}

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
    const watchTarget = querySelectorDeep(this.rule.trigger.watch);
    if (!watchTarget) {
      // logger.debug(`❓ 轮询未找到 watch 目标: [${this.rule.name}]`);
      return;
    }
    const scope = watchTarget.shadowRoot || watchTarget;
    // logger.debug(`🔁 轮询触发: [${this.rule.name}]`);
    this.onTrigger(this.rule, scope);
  }
}

export class PageInjector {
  private domReady = false;
  private lastUrl = "";

  // 活跃的动态规则监听器
  private activeWatchers = new Map<DynamicPageRule, DynamicRuleWatcher>();
  // 活跃的輪詢規則執行器
  private activePollingWatchers = new Map<
    PollingPageRule,
    PollingRuleWatcher
  >();

  // 防抖计时器（按 rule + scope 独立防抖）
  private ruleDebounceTimers = new Map<
    DynamicPageRule,
    Map<HTMLElement | ShadowRoot | Document, number>
  >();

  constructor() {
    logger.info("🚀 PageInjector 正在启动...");
    userStore.refreshData();

    // 启动 URL 监控 (处理 SPA 跳转)
    this.startUrlMonitor();

    this.onDomReady(async () => {
      await this.waitForBiliEnvironment();
      await sleep(100);
      this.domReady = true;

      // DOM Ready 后手动触发一次当前 URL 的处理
      this.handleUrlChange();
    });
  }

  /**
   * 数据刷新入口 (通常由外部或菜单触发)
   */
  public refreshData() {
    userStore.refreshData();

    if (this.domReady) {
      // 1. 更新已存在的 DOM 节点文字
      this.refreshExistingDomNodes();

      // 2. 重新触发所有活跃规则的扫描 (从 document 开始，确保全覆盖)
      // 注意：这里我们让活跃的 watcher 对应的规则再跑一遍
      const activeRules = [
        ...this.activeWatchers.keys(),
        ...this.activePollingWatchers.keys(),
      ];
      if (activeRules.length > 0) {
        this.scanSpecificRules(activeRules, document);
      }
    }
  }

  /**
   * 启动简单的 URL 轮询监控
   * B站是 SPA，pushState/replaceState 难以完全覆盖所有跳转场景，轮询最稳健
   */
  private startUrlMonitor() {
    this.lastUrl = unsafeWindow.location.href;
    window.setInterval(() => {
      const currentUrl = unsafeWindow.location.href;
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl;
        logger.debug(`🌏 URL 变更检测: ${currentUrl}`);
        this.handleUrlChange();
      }
    }, 1000);
  }

  /**
   * 处理 URL 变更 / 页面初始化
   */
  private handleUrlChange() {
    if (!this.domReady) return;

    // 1. 获取当前 URL 匹配的所有规则
    const matchedRules = this.getMatchedRules();

    // 2. 分类规则
    const staticRules = matchedRules.filter(
      (r) => r.injectMode === InjectionMode.Static,
    );
    const dynamicRules = matchedRules.filter(
      (r) => r.injectMode === InjectionMode.Dynamic,
    ) as DynamicPageRule[];
    const pollingRules = matchedRules.filter(
      (r) => r.injectMode === InjectionMode.Polling,
    ) as PollingPageRule[];

    // 3. 执行静态规则 (每次 URL 变动都尝试执行一次，因为页面结构可能重绘)
    if (staticRules.length > 0) {
      this.scanSpecificRules(staticRules, document);
    }

    // 4. 管理动态规则监听器 (Diff 算法: 停止旧的，启动新的)
    this.reconcileWatchers(dynamicRules);
    // 5. 管理輪詢規則執行器
    this.reconcilePollingWatchers(pollingRules);
  }

  /**
   * 调和 Watchers：清理不再匹配的，启动新增的
   */
  private reconcileWatchers(newRules: DynamicPageRule[]) {
    // A. 找出需要移除的 (当前活跃但不在新规则列表中的)
    for (const [rule, watcher] of this.activeWatchers) {
      if (!newRules.includes(rule)) {
        watcher.stop();
        this.clearRuleDebounceTimers(rule);
        this.activeWatchers.delete(rule);
      }
    }

    // B. 找出需要新增的
    newRules.forEach((rule) => {
      if (!this.activeWatchers.has(rule)) {
        const watcher = new DynamicRuleWatcher(rule, (r, scope) => {
          this.scheduleRuleScan(r, r.trigger.interval, scope);
        });
        this.activeWatchers.set(rule, watcher);
        watcher.start();
      }
    });
  }

  private reconcilePollingWatchers(newRules: PollingPageRule[]) {
    for (const [rule, watcher] of this.activePollingWatchers) {
      if (!newRules.includes(rule)) {
        watcher.stop();
        this.activePollingWatchers.delete(rule);
      }
    }

    newRules.forEach((rule) => {
      if (!this.activePollingWatchers.has(rule)) {
        const watcher = new PollingRuleWatcher(rule, (r, scope) => {
          this.scanSpecificRules([r], scope);
        });
        this.activePollingWatchers.set(rule, watcher);
        watcher.start();
      }
    });
  }

  private scheduleRuleScan(
    rule: DynamicPageRule,
    delay: number,
    scope: HTMLElement | ShadowRoot | Document,
  ) {
    let scopeTimers = this.ruleDebounceTimers.get(rule);
    if (!scopeTimers) {
      scopeTimers = new Map<HTMLElement | ShadowRoot | Document, number>();
      this.ruleDebounceTimers.set(rule, scopeTimers);
    }

    const existing = scopeTimers.get(scope);
    if (existing) clearTimeout(existing);

    // 使用 window.setTimeout 确保 ID 类型正确
    const timerId = window.setTimeout(() => {
      const activeScopeTimers = this.ruleDebounceTimers.get(rule);
      activeScopeTimers?.delete(scope);
      if (activeScopeTimers && activeScopeTimers.size === 0) {
        this.ruleDebounceTimers.delete(rule);
      }
      this.scanSpecificRules([rule], scope);
    }, delay);

    scopeTimers.set(scope, timerId);
  }

  private clearRuleDebounceTimers(rule: DynamicPageRule) {
    const scopeTimers = this.ruleDebounceTimers.get(rule);
    if (!scopeTimers) return;

    scopeTimers.forEach((timerId) => clearTimeout(timerId));
    this.ruleDebounceTimers.delete(rule);
  }

  private scanSpecificRules(
    rules: PageRule[],
    scope: HTMLElement | ShadowRoot | Document,
  ) {
    if (rules.length === 0) return;

    const queue = [...rules];

    const runChunk = (deadline: IdleDeadline) => {
      const processNext = async () => {
        // 剩余时间 > 1ms 且队列不为空
        while (queue.length > 0 && deadline.timeRemaining() > 1) {
          const rule = queue.shift()!;
          await this.scanAndInjectRule(rule, scope);
        }
        if (queue.length > 0) {
          this.requestIdle(runChunk);
        }
      };
      processNext();
    };

    this.requestIdle(runChunk);
  }

  private requestIdle(cb: (deadline: IdleDeadline) => void) {
    const ric =
      (window as any).requestIdleCallback ||
      ((fn: any) => setTimeout(() => fn({ timeRemaining: () => 16 }), 16));
    ric(cb, { timeout: 1000 });
  }

  /**
   * 执行单条规则注入
   * @param scope - 搜索范围 (优化核心)
   */
  private async scanAndInjectRule(
    rule: PageRule,
    scope: HTMLElement | ShadowRoot | Document,
  ) {
    let selector = `${rule.aSelector}`;
    if (!rule.ignoreProcessed) selector += ":not([data-bili-processed])";
    // Static 模式：通常 scope 是 document，尝试几次防止加载延迟
    if (rule.injectMode === InjectionMode.Static) {
      // 1. 初始获取所有匹配的元素
      let elements = querySelectorAllDeep(selector, scope);

      // 2. 增强的重试机制 (针对列表加载延迟)
      if (elements.length === 0) {
        for (let i = 0; i < 3; i++) {
          await sleep(300);
          elements = querySelectorAllDeep(selector, scope);
          // 只要找到了至少一个元素，就跳出重试
          if (elements.length > 0) break;
        }
      }

      // 3. 批量应用规则
      if (elements.length > 0) {
        logger.debug(
          `💉 静态注入: 找到 ${elements.length} 个目标元素 [${selector}]`,
        );
        elements.forEach((element) => {
          this.applyRuleToElement(element, rule);
        });
      }
      return;
    }

    // Polling 模式 或 Dynamic 模式：利用 scope 局部查找
    const elements = querySelectorAllDeep(selector, scope);
    if (rule.injectMode === InjectionMode.Polling) {
      if (elements.length > 0) {
        logger.debug(
          `🔁 轮询注入 [${rule.name}]: 找到 ${elements.length} 个目标元素`,
        );
      }
    }
    elements.forEach((el) => this.applyRuleToElement(el, rule));
  }

  private async applyRuleToElement(el: HTMLElement, rule: PageRule) {
    // 防御性处理：跳过我们自己插入的可编辑节点，避免自我递归注入
    if (el.classList.contains("editable-textarea")) {
      el.setAttribute("data-bili-processed", "true");
      return;
    }

    const uid = extractUid(el);
    const originalName = getElementDisplayName(el, rule);
    if (!uid) return;

    const user = userStore.ensureUser(uid, originalName);

    // 执行渲染
    const applied = await injectMemoRenderer(el, user, rule, {
      uid,
      originalName,
    });

    if (applied) {
      el.setAttribute("data-bili-processed", "true");
      // 可以在这里存储 originalName 到 dataset 以便 refreshExistingDomNodes 使用
      // el.setAttribute("data-bili-original", originalName || "");
      // el.setAttribute("data-bili-uid", uid);
    }
  }

  /**
   * 获取当前 URL 匹配的规则
   */
  private getMatchedRules(): PageRule[] {
    const currentUrl = unsafeWindow.location.href;
    return Array.from(config.entries())
      .filter(([pattern]) => pattern.test(currentUrl))
      .map(([_, rule]) => rule);
  }

  private refreshExistingDomNodes() {
    const allTags = querySelectorAllDeep(`.bili-memo-tag, .editable-textarea`);
    allTags.forEach((tag) => {
      const uid = tag.getAttribute("data-bili-uid");
      const originalName = tag.getAttribute("data-bili-original") || "";
      if (!uid) return;

      const user = userStore.users.find((u) => u.id === uid);

      if (!user || !user.memo) {
        tag.textContent = originalName;
        tag.classList.remove("bili-memo-tag");
      } else {
        tag.textContent = formatDisplayName(
          user,
          originalName,
          userStore.displayMode,
        );
        if (
          !tag.classList.contains("bili-memo-tag") &&
          !tag.classList.contains("editable-textarea")
        ) {
          tag.classList.add("bili-memo-tag");
        }
      }
    });
  }

  // 辅助方法
  private onDomReady(callback: () => void) {
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      callback();
      return;
    }
    window.addEventListener("DOMContentLoaded", () => callback(), {
      once: true,
    });
  }

  private async waitForBiliEnvironment(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const win = unsafeWindow as any;
        // 适当放宽检测条件，部分页面可能只依赖 Vue
        if (win.__VUE__) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }
}

// 单例导出
let pageInjector: PageInjector | null = null;

export function initPageInjection() {
  if (!pageInjector) pageInjector = new PageInjector();
}

export function refreshPageInjection() {
  pageInjector?.refreshData();
}

export { setCustomMemoCss } from "./style-manager";

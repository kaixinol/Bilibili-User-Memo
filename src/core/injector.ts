// src/core/injector.ts
import {
  querySelectorAllDeep,
} from "query-selector-shadow-dom";
import {
  InjectionMode,
  PageRule,
  DynamicPageRule,
  PollingPageRule,
} from "../configs/rules";
import { logger } from "../utils/logger";
import { sleep } from "../utils/sleep";
import { userStore, UserStoreChange } from "./store";
import {
  extractUid,
  getElementDisplayName,
} from "./dom-utils";
import { injectMemoRenderer } from "./renderer";
import { refreshRenderedMemoNodes } from "./dom-refresh";
import { DynamicRuleWatcher, PollingRuleWatcher } from "./watchers";
import { getMatchedRulesByUrl } from "./rule-matcher";

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
    userStore.subscribe((change) => this.handleStoreChange(change));

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
      // 重新触发所有活跃规则的扫描 (从 document 开始，确保全覆盖)
      this.scanActiveRules(document);
    }
  }

  private handleStoreChange(change: UserStoreChange) {
    if (!this.domReady) return;

    if (change.type === "displayMode") {
      refreshRenderedMemoNodes(userStore.getUsers(), change.displayMode);
      return;
    }

    if (change.type === "users") {
      refreshRenderedMemoNodes(change.users, userStore.displayMode, change.changedIds);
      // 用户数据变化时触发一次活跃规则重扫，覆盖“当前已在页面但尚未处理”的节点
      if (change.reason !== "remote") {
        this.scanActiveRules(document);
      }
      return;
    }

    refreshRenderedMemoNodes(change.users, change.displayMode);
    this.scanActiveRules(document);
  }

  private scanActiveRules(scope: HTMLElement | ShadowRoot | Document) {
    const activeRules = [
      ...this.activeWatchers.keys(),
      ...this.activePollingWatchers.keys(),
    ];
    if (activeRules.length > 0) {
      this.scanSpecificRules(activeRules, scope);
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
    const baseSelector = rule.aSelector || rule.textSelector;
    if (!baseSelector) return;

    let selector = `${baseSelector}`;
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

    const originalName = getElementDisplayName(el, rule);
    const uid = this.resolveElementUid(el, rule, originalName);
    if (!uid) return;

    const user = userStore.ensureUser(uid, originalName);

    // 执行渲染
    const applied = await injectMemoRenderer(el, user, rule, {
      uid,
      originalName,
    });

    if (applied) {
      el.setAttribute("data-bili-processed", "true");
      // 渲染器会同步 data-bili-original / data-bili-uid
      // el.setAttribute("data-bili-original", originalName || "");
      // el.setAttribute("data-bili-uid", uid);
    }
  }

  private resolveElementUid(
    el: HTMLElement,
    rule: PageRule,
    originalName: string,
  ): string | null {
    const uid = extractUid(el, Boolean(rule.matchByName));
    if (uid) return uid;

    // 私信右侧当前会话名节点本身不带 UID，回退到左侧激活会话读取
    if (el.matches('div[class^="_ContactName_"]')) {
      const whisperUid = this.getActiveWhisperUid();
      if (whisperUid) return whisperUid;
    }

    // 启用 matchByName 时，允许按原始昵称回退查找 UID
    if (rule.matchByName && originalName) {
      return userStore.findUserByName(originalName)?.id || null;
    }

    return null;
  }

  private getActiveWhisperUid(): string | null {
    return (
      document
        .querySelector(
          'div[class*="_SessionItemIsActive_"][data-id^="contact_"]',
        )
        ?.getAttribute("data-id")
        ?.split("_")?.[1] || null
    );
  }

  /**
   * 获取当前 URL 匹配的规则
   */
  private getMatchedRules(): PageRule[] {
    return getMatchedRulesByUrl(unsafeWindow.location.href);
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

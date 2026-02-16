import { querySelectorAllDeep } from "query-selector-shadow-dom";
import {
  InjectionMode,
  PageRule,
  StaticPageRule,
  DynamicPageRule,
  PollingPageRule,
} from "../../configs/rules";
import { logger } from "../../utils/logger";
import { sleep } from "../../utils/sleep";
import { extractUid, getElementDisplayName } from "../dom/dom-utils";
import { refreshRenderedMemoNodes } from "../render/dom-refresh";
import { injectMemoRenderer } from "../render/renderer";
import { userStore, UserStoreChange } from "../store/store";
import { BiliUser } from "../types";
import { getMatchedRulesByUrl } from "./rule-matcher";
import { DynamicRuleWatcher, PollingRuleWatcher } from "./watchers";

type ScanScope = HTMLElement | ShadowRoot | Document;

interface RuleGroups {
  staticRules: StaticPageRule[];
  dynamicRules: DynamicPageRule[];
  pollingRules: PollingPageRule[];
}

export class PageInjector {
  private domReady = false;
  private lastUrl = "";
  private staticRetryTimers: number[] = [];
  private staticRetryToken = 0;

  private activeWatchers = new Map<DynamicPageRule, DynamicRuleWatcher>();
  private activePollingWatchers = new Map<PollingPageRule, PollingRuleWatcher>();

  // rule + scope 双键防抖，避免不同容器互相覆盖定时器
  private ruleDebounceTimers = new Map<DynamicPageRule, Map<ScanScope, number>>();

  constructor() {
    logger.info("🚀 PageInjector 正在启动...");
    userStore.refreshData();
    userStore.subscribe((change) => this.handleStoreChange(change));

    this.startUrlMonitor();
    this.onDomReady(async () => {
      await this.waitForBiliEnvironment();
      await sleep(100);
      this.domReady = true;
      this.handleUrlChange();
    });
  }

  public refreshData() {
    userStore.refreshData();
    if (!this.domReady) return;
    this.scanActiveRules(document);
  }

  private handleStoreChange(change: UserStoreChange) {
    if (!this.domReady) return;

    if (change.type === "displayMode") {
      this.refreshRenderedNodes(userStore.getUsers(), change.displayMode);
      return;
    }

    if (change.type === "users") {
      this.refreshRenderedNodes(
        change.users,
        userStore.displayMode,
        change.changedIds,
      );
      if (change.reason === "import") {
        this.scanMatchByNameRules(document);
      }
      return;
    }

    this.refreshRenderedNodes(change.users, change.displayMode);
  }

  private refreshRenderedNodes(
    users: BiliUser[],
    displayMode: number,
    changedIds?: string[],
  ) {
    refreshRenderedMemoNodes(users, displayMode, changedIds);
  }

  private scanActiveRules(scope: ScanScope) {
    const activeRules = [
      ...this.activeWatchers.keys(),
      ...this.activePollingWatchers.keys(),
    ];
    if (activeRules.length === 0) return;
    this.scanSpecificRules(activeRules, scope);
  }

  private startUrlMonitor() {
    this.lastUrl = unsafeWindow.location.href;
    window.setInterval(() => {
      const currentUrl = unsafeWindow.location.href;
      if (currentUrl === this.lastUrl) return;
      this.lastUrl = currentUrl;
      logger.debug(`🌏 URL 变更检测: ${currentUrl}`);
      this.handleUrlChange();
    }, 1000);
  }

  private handleUrlChange() {
    if (!this.domReady) return;

    const groups = this.groupRulesByMode(this.getMatchedRules());
    this.applyStaticRules(groups.staticRules, document);
    this.reconcileWatchers(groups.dynamicRules);
    this.reconcilePollingWatchers(groups.pollingRules);
  }

  private groupRulesByMode(rules: PageRule[]): RuleGroups {
    const groups: RuleGroups = {
      staticRules: [],
      dynamicRules: [],
      pollingRules: [],
    };

    rules.forEach((rule) => {
      if (rule.injectMode === InjectionMode.Static) {
        groups.staticRules.push(rule);
        return;
      }
      if (rule.injectMode === InjectionMode.Dynamic) {
        groups.dynamicRules.push(rule);
        return;
      }
      groups.pollingRules.push(rule);
    });

    return groups;
  }

  private applyStaticRules(staticRules: StaticPageRule[], scope: ScanScope) {
    if (staticRules.length === 0) {
      this.clearStaticRetryTimers();
      return;
    }
    this.scanSpecificRules(staticRules, scope);
    this.scheduleStaticRuleRetries(staticRules, scope);
  }

  private reconcileWatchers(nextRules: DynamicPageRule[]) {
    for (const [rule, watcher] of this.activeWatchers) {
      if (nextRules.includes(rule)) continue;
      watcher.stop();
      this.clearRuleDebounceTimers(rule);
      this.activeWatchers.delete(rule);
    }

    nextRules.forEach((rule) => {
      if (this.activeWatchers.has(rule)) return;
      const watcher = new DynamicRuleWatcher(rule, (r, scope) => {
        this.scheduleRuleScan(r, r.trigger.debounceMs, scope);
      });
      this.activeWatchers.set(rule, watcher);
      watcher.start();
    });
  }

  private reconcilePollingWatchers(nextRules: PollingPageRule[]) {
    for (const [rule, watcher] of this.activePollingWatchers) {
      if (nextRules.includes(rule)) continue;
      watcher.stop();
      this.activePollingWatchers.delete(rule);
    }

    nextRules.forEach((rule) => {
      if (this.activePollingWatchers.has(rule)) return;
      const watcher = new PollingRuleWatcher(rule, (r, scope) => {
        this.scanSpecificRules([r], scope);
      });
      this.activePollingWatchers.set(rule, watcher);
      watcher.start();
    });
  }

  private scanMatchByNameRules(scope: ScanScope) {
    const rules = [
      ...this.activeWatchers.keys(),
      ...this.activePollingWatchers.keys(),
    ].filter((rule) => Boolean(rule.matchByName));
    if (rules.length === 0) return;
    this.scanSpecificRules(rules, scope);
  }

  private clearStaticRetryTimers() {
    this.staticRetryToken++;
    this.staticRetryTimers.forEach((timerId) => clearTimeout(timerId));
    this.staticRetryTimers = [];
  }

  private scheduleStaticRuleRetries(
    staticRules: StaticPageRule[],
    scope: ScanScope,
  ) {
    this.clearStaticRetryTimers();
    const token = this.staticRetryToken;
    const retryDelays = [350, 900];

    retryDelays.forEach((delay) => {
      const timerId = window.setTimeout(() => {
        if (!this.domReady || token !== this.staticRetryToken) return;
        this.scanSpecificRules(staticRules, scope);
      }, delay);
      this.staticRetryTimers.push(timerId);
    });
  }

  private scheduleRuleScan(rule: DynamicPageRule, delay: number, scope: ScanScope) {
    let scopeTimers = this.ruleDebounceTimers.get(rule);
    if (!scopeTimers) {
      scopeTimers = new Map<ScanScope, number>();
      this.ruleDebounceTimers.set(rule, scopeTimers);
    }

    const existingTimer = scopeTimers.get(scope);
    if (existingTimer) clearTimeout(existingTimer);

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

  private scanSpecificRules(rules: PageRule[], scope: ScanScope) {
    if (rules.length === 0) return;

    const queue = [...rules];
    const runChunk = (deadline: IdleDeadline) => {
      const processNext = async () => {
        while (queue.length > 0 && deadline.timeRemaining() > 1) {
          const rule = queue.shift()!;
          await this.scanAndInjectRule(rule, scope);
        }
        if (queue.length > 0) {
          this.requestIdle(runChunk);
        }
      };
      void processNext();
    };

    this.requestIdle(runChunk);
  }

  private requestIdle(cb: (deadline: IdleDeadline) => void) {
    const ric =
      (window as any).requestIdleCallback ||
      ((fn: any) => setTimeout(() => fn({ timeRemaining: () => 16 }), 16));
    ric(cb, { timeout: 1000 });
  }

  private async scanAndInjectRule(rule: PageRule, scope: ScanScope) {
    const selector = this.buildRuleSelector(rule);
    if (!selector) return;

    const elements = querySelectorAllDeep(selector, scope);
    this.logRuleScanResult(rule, selector, elements.length);
    if (elements.length === 0) return;

    elements.forEach((el) => {
      void this.applyRuleToElement(el, rule);
    });
  }

  private buildRuleSelector(rule: PageRule): string | null {
    const baseSelector = rule.aSelector || rule.textSelector;
    if (!baseSelector) return null;
    if (rule.ignoreProcessed) return baseSelector;
    return `${baseSelector}:not([data-bili-processed])`;
  }

  private logRuleScanResult(rule: PageRule, selector: string, count: number) {
    if (count === 0) return;

    if (rule.injectMode === InjectionMode.Static) {
      logger.debug(`💉 静态注入: 找到 ${count} 个目标元素 [${selector}]`);
      return;
    }
    if (rule.injectMode === InjectionMode.Polling) {
      logger.debug(`🔁 轮询注入 [${rule.name}]: 找到 ${count} 个目标元素`);
    }
  }

  private async applyRuleToElement(el: HTMLElement, rule: PageRule) {
    if (el.classList.contains("editable-textarea")) {
      el.setAttribute("data-bili-processed", "true");
      return;
    }

    const originalName = getElementDisplayName(el, rule);
    const uid = this.resolveElementUid(el, rule, originalName);
    if (!uid) return;

    const user = userStore.ensureUser(uid, originalName);
    const applied = await injectMemoRenderer(el, user, rule, { uid, originalName });
    if (applied) {
      el.setAttribute("data-bili-processed", "true");
    }
  }

  private resolveElementUid(
    el: HTMLElement,
    rule: PageRule,
    originalName: string,
  ): string | null {
    const uid = extractUid(el, Boolean(rule.matchByName));
    if (uid) return uid;

    if (el.matches('div[class^="_ContactName_"]')) {
      const whisperUid = this.getActiveWhisperUid();
      if (whisperUid) return whisperUid;
    }

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

  private getMatchedRules(): PageRule[] {
    return getMatchedRulesByUrl(unsafeWindow.location.href);
  }

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
        if (win.__VUE__) resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }
}

let pageInjector: PageInjector | null = null;

export function initPageInjection() {
  if (!pageInjector) pageInjector = new PageInjector();
}

export function refreshPageInjection() {
  pageInjector?.refreshData();
}

export { setCustomMemoCss } from "../style/style-manager";

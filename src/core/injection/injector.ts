import { querySelectorAllDeep } from "@/utils/query-dom";
import {
  type PageRule,
  type DynamicPageRule,
  getInjectMode,
} from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import { extractUid } from "../dom/uid-extractor";
import { getElementDisplayName } from "../dom/text-utils";
import { refreshRenderedMemoNodes } from "../render/dom-refresh";
import { injectMemoRenderer } from "../render/renderer";
import { userStore, type UserStoreChange } from "../store/store";
import { createUrlMonitor, type UrlMonitor } from "./url-monitor";
import { syncSpaceProfile } from "./space-profile";
import type { BiliUser } from "../types";
import { DynamicRuleWatcher } from "./watchers";
import { unsafeWindow } from "$";
import type { ScanScope } from "./scan-scope";
import {
  buildRuleSelector,
  getMatchByNameRules,
  getMatchedRules,
  groupRulesByMode,
  logRuleScanResult,
  type RuleGroups,
} from "./rule-runtime";
import { RemoteChangeBuffer } from "./remote-change-buffer";
import { RuleScanScheduler } from "./scan-scheduler";
import { delay, waitUntil } from "@/utils/scheduler";
import { isNodeInsideScope } from "./watch-runtime";
import {
  describeElementForDiagnostics,
  getScopeType,
  recordRuleApplyDiagnostic,
  recordRuleScanDiagnostic,
} from "@/utils/perf-diagnostics";

class PageInjector {
  private domReady = false;
  private readonly urlMonitor: UrlMonitor;
  private readonly pendingRemoteChanges = new RemoteChangeBuffer();
  private readonly scanScheduler = new RuleScanScheduler(
    (rule, scope) => this.scanAndInjectRule(rule, scope),
    () => this.domReady,
  );

  private activeWatchers = new Map<DynamicPageRule, DynamicRuleWatcher>();

  constructor() {
    logger.info("🚀 PageInjector 正在启动...");
    userStore.subscribe((change) => this.handleStoreChange(change));
    document.addEventListener("visibilitychange", () =>
      this.handleVisibilityChange(),
    );

    this.urlMonitor = createUrlMonitor(() => this.handleUrlChange());
    this.urlMonitor.start();
    this.onDomReady(async () => {
      await this.waitForBiliEnvironment();
      await delay(100);
      this.domReady = true;
      this.handleUrlChange();
    });
  }

  private handleStoreChange(change: UserStoreChange) {
    if (!this.domReady) return;
    if (this.shouldDeferRemoteChange(change)) {
      this.queuePendingRemoteChange(change);
      return;
    }

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
      if (change.rescanMatchByName) {
        this.scanMatchByNameRules(document);
      }
      return;
    }

    this.refreshRenderedNodes(change.users, change.displayMode);
  }

  private shouldDeferRemoteChange(change: UserStoreChange): boolean {
    return (
      change.reason === "remote" && document.visibilityState !== "visible"
    );
  }

  private queuePendingRemoteChange(change: UserStoreChange) {
    this.pendingRemoteChanges.queue(change);
  }

  private handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    if (!this.domReady) return;
    this.flushPendingRemoteChanges();
  }

  private flushPendingRemoteChanges() {
    const pendingState = this.pendingRemoteChanges.consume();
    if (!pendingState) return;

    this.urlMonitor.syncUrl();

    const users = userStore.getUsers();
    const displayMode = userStore.displayMode;
    const needsFullRefresh =
      pendingState.needsFullRefresh || pendingState.displayModeChanged;
    const changedIds = pendingState.changedIds;

    if (needsFullRefresh) {
      this.refreshRenderedNodes(users, displayMode);
    } else if (changedIds.length > 0) {
      this.refreshRenderedNodes(users, displayMode, changedIds);
    }

    if (pendingState.rescanMatchByName) {
      this.scanMatchByNameRules(document);
    }
  }

  private refreshRenderedNodes(
    users: readonly BiliUser[],
    displayMode: number,
    changedIds?: string[],
  ) {
    refreshRenderedMemoNodes(users, displayMode, changedIds);
  }

  private scanActiveRules(scope: ScanScope) {
    const activeRules = [...this.activeWatchers.keys()];
    if (activeRules.length === 0) return;
    this.scanScheduler.scanRules(activeRules, scope, "refresh active rules");
  }

  private handleUrlChange() {
    if (!this.domReady) return;

    void syncSpaceProfile();

    const matchedRules = getMatchedRules();
    const groups = this.groupRulesByMode(matchedRules);
    this.applyStaticRules(groups.staticRules, document);
    this.reconcileWatchers(groups.dynamicRules);
    this.scanActiveRules(document);
  }

  private groupRulesByMode(rules: PageRule[]): RuleGroups {
    return groupRulesByMode(rules);
  }

  private applyStaticRules(
    staticRules: ReturnType<typeof groupRulesByMode>["staticRules"],
    scope: ScanScope,
  ) {
    if (staticRules.length === 0) {
      this.scanScheduler.clearStaticRuleRetries();
      return;
    }
    this.scanScheduler.scanRules(staticRules, scope, "static initial scan");
    this.scanScheduler.scheduleStaticRuleRetries(staticRules, scope);
  }

  private reconcileWatchers(nextRules: DynamicPageRule[]) {
    for (const [rule, watcher] of this.activeWatchers) {
      if (nextRules.includes(rule)) continue;
      watcher.stop();
      this.scanScheduler.clearRuleDebounceTimers(rule);
      this.activeWatchers.delete(rule);
    }

    nextRules.forEach((rule) => {
      if (this.activeWatchers.has(rule)) return;
      const watcher = new DynamicRuleWatcher(rule, (r, scope) => {
        this.scanScheduler.scheduleDynamicRuleScan(r, r.trigger.interval, scope);
      });
      this.activeWatchers.set(rule, watcher);
      watcher.start();
    });
  }

  private scanMatchByNameRules(scope: ScanScope) {
    const rules = getMatchByNameRules(this.activeWatchers.keys());
    if (rules.length === 0) return;
    this.scanScheduler.scanRules(rules, scope, "matchByName rescan");
  }

  private async scanAndInjectRule(
    rule: PageRule,
    scope: ScanScope,
  ) {
    const selector = buildRuleSelector(rule);
    if (!selector) return;

    const scanStart = __IS_DEBUG__ ? performance.now() : 0;
    const queryStart = __IS_DEBUG__ ? performance.now() : 0;
    const elements =
      scope instanceof ShadowRoot
        ? querySelectorAllDeep(selector).filter((element) =>
            isNodeInsideScope(element, scope),
          )
        : querySelectorAllDeep(selector, scope);
    const queryMs = __IS_DEBUG__ ? performance.now() - queryStart : 0;
    logRuleScanResult(rule, selector, elements.length);
    if (__IS_DEBUG__) {
      recordRuleScanDiagnostic({
        ruleName: rule.name,
        mode: getInjectMode(rule),
        selector,
        scopeType: getScopeType(scope),
        matchCount: elements.length,
        queryMs,
        totalMs: performance.now() - scanStart,
      });
    }
    if (elements.length === 0) return;

    elements.forEach((el) => {
      if (el.classList.contains("editable-textarea")) return;

      // DOM 复用检测：UID 没变则跳过，变了则清旧数据重处理
      const storedUid = el.getAttribute("data-bili-uid");
      if (storedUid) {
        const currentUid = extractUid(el, { silent: true, allowLocationFallback: false });
        if (currentUid && storedUid === currentUid) return;
        el.removeAttribute("data-bili-uid");
        el.removeAttribute("data-bili-original");
      }

      void this.applyRuleToElement(el, rule);
    });
  }

  private async applyRuleToElement(el: HTMLElement, rule: PageRule) {
    const applyStart = __IS_DEBUG__ ? performance.now() : 0;
    const element = __IS_DEBUG__ ? describeElementForDiagnostics(el) : "";
    let uidResolved = false;
    let applied = false;

    try {
      const originalName =
        rule.originalNameResolver?.(el, rule) || getElementDisplayName(el, rule);
      const uid = await this.resolveElementUid(el, rule, originalName);
      uidResolved = Boolean(uid);
      if (!uid) return;

      const user = userStore.ensureUser(uid, originalName);
      applied = await injectMemoRenderer(el, user, rule, { uid, originalName });
    } finally {
      if (__IS_DEBUG__) {
        recordRuleApplyDiagnostic({
          ruleName: rule.name,
          mode: getInjectMode(rule),
          element,
          uidResolved,
          applied,
          totalMs: performance.now() - applyStart,
        });
      }
    }
  }

  /**
   * 解析元素对应的 UID。
   *
   * 优先级固定为：
   *   1. rule.uidResolver
   *   2. extractUid
   *   3. matchByName（仅显式开启时作为最后兜底）
   */
  private async resolveElementUid(
    el: HTMLElement,
    rule: PageRule,
    originalName: string,
  ): Promise<string | null> {
    if (rule.uidResolver) {
      const uid = await rule.uidResolver(el, rule);
      if (uid) return uid;
      logger.warn("[resolveElementUid] uidResolver returned empty", {
        ruleName: rule.name,
        originalName,
        textContent: el.textContent?.trim() || "",
        element: el,
      });
    }

    const uid = extractUid(el, {
      silent: Boolean(rule.matchByName),
      allowLocationFallback: !rule.matchByName,
    });
    if (uid) return uid;

    if (rule.matchByName && originalName) {
      return userStore.findUserByName(originalName)?.id || null;
    }

    return null;
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
    const ready = await waitUntil(() => Boolean((unsafeWindow as any).__VUE__), {
      timeoutMs: 5000,
    });
    if (!ready) {
      logger.warn("等待 Bilibili Vue 环境超时，继续初始化页面注入");
    }
  }
}

let pageInjector: PageInjector | null = null;

export function initPageInjection() {
  if (!pageInjector) pageInjector = new PageInjector();
}

export { setCustomMemoCss } from "../style/style-manager";

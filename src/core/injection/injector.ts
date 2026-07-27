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
  buildMergedSelector,
  buildRuleSelector,
  getMatchByNameRules,
  getMatchedRules,
  getSingleTargetDynamicRules,
  groupRulesByMode,
  logRuleScanResult,
  type RuleGroups,
} from "./rule-runtime";
import { RemoteChangeBuffer } from "./remote-change-buffer";
import { waitUntil } from "@/utils/scheduler";
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

  private matchedStaticRules: PageRule[] = [];
  private activeWatchers = new Map<DynamicPageRule, DynamicRuleWatcher>();
  private multiTargetScanTimer: number | null = null;
  private activeMultiTargetRules: DynamicPageRule[] = [];

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
      await new Promise((resolve) => requestAnimationFrame(resolve));
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

  private handleUrlChange() {
    if (!this.domReady) return;

    void syncSpaceProfile();

    const matchedRules = getMatchedRules();
    const groups = this.groupRulesByMode(matchedRules);

    this.matchedStaticRules = groups.staticRules;

    if (groups.staticRules.length > 0) {
      this.scanAndInjectRulesBatch(groups.staticRules, document);
    }

    const singleTarget = getSingleTargetDynamicRules(groups.dynamicRules);
    const multiTarget = groups.dynamicRules.filter((r) => r.multiTarget);

    this.reconcileWatchers(singleTarget);
    this.reconcileMultiTargetScan(multiTarget);
  }

  private groupRulesByMode(rules: PageRule[]): RuleGroups {
    return groupRulesByMode(rules);
  }

  private async scanAndInjectRulesBatch(
    rules: PageRule[],
    scope: ScanScope,
  ) {
    const merged = buildMergedSelector(rules);
    if (!merged) return;

    const scanStart = __IS_DEBUG__ ? performance.now() : 0;
    const elements = querySelectorAllDeep(merged, scope);
    if (__IS_DEBUG__) {
      recordRuleScanDiagnostic({
        ruleName: rules.map((r) => r.name).join(","),
        mode: getInjectMode(rules[0]),
        selector: merged,
        scopeType: getScopeType(scope),
        matchCount: elements.length,
        queryMs: 0,
        totalMs: performance.now() - scanStart,
      });
    }
    if (elements.length === 0) return;

    const selectorRules = rules
      .map((r) => ({ selector: buildRuleSelector(r), rule: r }))
      .filter(
        (r): r is { selector: string; rule: PageRule } => r.selector !== null,
      );

    for (const el of elements) {
      if (el.classList.contains("editable-textarea")) continue;

      for (const { selector, rule } of selectorRules) {
        if (!el.matches(selector)) continue;

        const storedUid = el.dataset.bilimemoUid;
        let preResolvedUid: string | null = null;
        if (storedUid) {
          preResolvedUid = extractUid(el, {
            silent: true,
            allowLocationFallback: false,
          });
          if (preResolvedUid && storedUid === preResolvedUid) continue;
        }

        void this.applyRuleToElement(el, rule, preResolvedUid);
      }
    }
  }

  private reconcileWatchers(nextRules: DynamicPageRule[]) {
    for (const [rule, watcher] of this.activeWatchers) {
      if (nextRules.includes(rule)) continue;
      watcher.stop();
      this.activeWatchers.delete(rule);
    }

    nextRules.forEach((rule) => {
      if (this.activeWatchers.has(rule)) return;
      const watcher = new DynamicRuleWatcher(rule, (r, scope) => {
        this.scanAndInjectRule(r, scope);
        if (this.matchedStaticRules.length > 0) {
          this.scanAndInjectRulesBatch(this.matchedStaticRules, scope);
        }
      });
      this.activeWatchers.set(rule, watcher);
      watcher.start();
    });
  }

  private reconcileMultiTargetScan(nextRules: DynamicPageRule[]) {
    this.activeMultiTargetRules = nextRules;
    this.stopMultiTargetScan();

    if (nextRules.length > 0) {
      this.scanAndInjectRulesBatch(nextRules, document);
      this.startMultiTargetScan(nextRules);
    }
  }

  private startMultiTargetScan(rules: DynamicPageRule[]) {
    if (rules.length === 0) return;
    const interval = rules[0].trigger.interval;
    this.multiTargetScanTimer = window.setInterval(() => {
      this.scanAndInjectRulesBatch(this.activeMultiTargetRules, document);
    }, interval);
  }

  private stopMultiTargetScan() {
    if (this.multiTargetScanTimer) {
      clearInterval(this.multiTargetScanTimer);
      this.multiTargetScanTimer = null;
    }
  }

  private scanMatchByNameRules(scope: ScanScope) {
    const rules = getMatchByNameRules(this.activeWatchers.keys());
    if (rules.length === 0) return;
    for (const rule of rules) {
      void this.scanAndInjectRule(rule, scope);
    }
  }

  private async scanAndInjectRule(
    rule: PageRule,
    scope: ScanScope,
  ) {
    const selector = buildRuleSelector(rule);
    if (!selector) return;

    const scanStart = __IS_DEBUG__ ? performance.now() : 0;
    const queryStart = __IS_DEBUG__ ? performance.now() : 0;
    const elements = querySelectorAllDeep(selector, scope);
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

      const storedUid = el.dataset.bilimemoUid;
      let preResolvedUid: string | null = null;
      if (storedUid) {
        preResolvedUid = extractUid(el, { silent: true, allowLocationFallback: false });
        if (preResolvedUid && storedUid === preResolvedUid) return;
      }

      void this.applyRuleToElement(el, rule, preResolvedUid);
    });
  }

  private async applyRuleToElement(el: HTMLElement, rule: PageRule, preResolvedUid?: string | null) {
    const applyStart = __IS_DEBUG__ ? performance.now() : 0;
    const element = __IS_DEBUG__ ? describeElementForDiagnostics(el) : "";
    let uidResolved = false;
    let applied = false;

    try {
      const originalName =
        rule.originalNameResolver?.(el, rule) || getElementDisplayName(el, rule);
      const uid = preResolvedUid ?? await this.resolveElementUid(el, rule, originalName);
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

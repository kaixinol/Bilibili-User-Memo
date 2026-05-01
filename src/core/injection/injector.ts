import { querySelectorAllDeep } from "@/utils/query-dom";
import {
  type PageRule,
  type DynamicPageRule,
  type PollingPageRule,
} from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import { extractUid } from "../dom/uid-extractor";
import { getElementDisplayName } from "../dom/text-utils";
import { refreshRenderedMemoNodes } from "../render/dom-refresh";
import { injectMemoRenderer } from "../render/renderer";
import { userStore, type UserStoreChange } from "../store/store";
import { findUniqueUserByName } from "../store/name-match";
import type { BiliUser } from "../types";
import { DynamicRuleWatcher, PollingRuleWatcher } from "./watchers";
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

export class PageInjector {
  private domReady = false;
  private lastUrl = "";
  private readonly pendingRemoteChanges = new RemoteChangeBuffer();
  private readonly scanScheduler = new RuleScanScheduler(
    (rule, scope) => this.scanAndInjectRule(rule, scope),
    () => this.domReady,
  );

  private activeWatchers = new Map<DynamicPageRule, DynamicRuleWatcher>();
  private activePollingWatchers = new Map<PollingPageRule, PollingRuleWatcher>();

  constructor() {
    logger.info("🚀 PageInjector 正在启动...");
    // userStore.refreshData();
    userStore.subscribe((change) => this.handleStoreChange(change));
    document.addEventListener("visibilitychange", () =>
      this.handleVisibilityChange(),
    );

    this.startUrlMonitor();
    this.onDomReady(async () => {
      await this.waitForBiliEnvironment();
      await delay(100);
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

    const currentUrl = unsafeWindow.location.href;
    if (currentUrl !== this.lastUrl) {
      this.lastUrl = currentUrl;
      logger.debug(`🌏 可见性恢复，先同步 URL: ${currentUrl}`);
      this.handleUrlChange();
    }

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
    this.scanScheduler.scanRules(activeRules, scope, "refresh active rules");
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

    const matchedRules = getMatchedRules();
    const groups = this.groupRulesByMode(matchedRules);
    this.applyStaticRules(groups.staticRules, document);
    this.reconcileWatchers(groups.dynamicRules);
    this.reconcilePollingWatchers(groups.pollingRules);
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

  private reconcilePollingWatchers(nextRules: PollingPageRule[]) {
    for (const [rule, watcher] of this.activePollingWatchers) {
      if (nextRules.includes(rule)) continue;
      watcher.stop();
      this.activePollingWatchers.delete(rule);
    }

    nextRules.forEach((rule) => {
      if (this.activePollingWatchers.has(rule)) return;
      const watcher = new PollingRuleWatcher(rule, (r, scope) => {
        this.scanScheduler.scanRules([r], scope, "polling tick");
      });
      this.activePollingWatchers.set(rule, watcher);
      watcher.start();
    });
  }

  private scanMatchByNameRules(scope: ScanScope) {
    const rules = getMatchByNameRules([
      ...this.activeWatchers.keys(),
      ...this.activePollingWatchers.keys(),
    ]);
    if (rules.length === 0) return;
    this.scanScheduler.scanRules(rules, scope, "matchByName rescan");
  }

  private async scanAndInjectRule(rule: PageRule, scope: ScanScope) {
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
        mode: rule.injectMode,
        selector,
        scopeType: getScopeType(scope),
        matchCount: elements.length,
        queryMs,
        totalMs: performance.now() - scanStart,
      });
    }
    if (elements.length === 0) return;

    elements.forEach((el) => {
      void this.applyRuleToElement(el, rule);
    });
  }

  private async applyRuleToElement(el: HTMLElement, rule: PageRule) {
    const applyStart = __IS_DEBUG__ ? performance.now() : 0;
    const element = __IS_DEBUG__ ? describeElementForDiagnostics(el) : "";
    let uidResolved = false;
    let applied = false;

    try {
      if (el.classList.contains("editable-textarea")) {
        el.setAttribute("data-bili-processed", "true");
        return;
      }

      const originalName = getElementDisplayName(el, rule);
      const uid = this.resolveElementUid(el, rule, originalName);
      uidResolved = Boolean(uid);
      if (!uid) return;

      const user = userStore.ensureUser(uid, originalName);
      applied = await injectMemoRenderer(el, user, rule, { uid, originalName });
      if (applied) {
        el.setAttribute("data-bili-processed", "true");
      }
    } finally {
      if (__IS_DEBUG__) {
        recordRuleApplyDiagnostic({
          ruleName: rule.name,
          mode: rule.injectMode,
          element,
          uidResolved,
          applied,
          totalMs: performance.now() - applyStart,
        });
      }
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
      const match = findUniqueUserByName(userStore.getUsers(), originalName);
      if (match.reason === "ignored") {
        logger.warn(`⚠️ matchByName 遇到已忽略昵称，已跳过匹配: [${rule.name}]`, {
          originalName,
        });
      }
      if (match.reason === "ambiguous") {
        logger.warn(`⚠️ matchByName 遇到重名，已跳过匹配: [${rule.name}]`, {
          originalName,
        });
      }
      return match.user?.id || null;
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
    await waitUntil(() => Boolean((unsafeWindow as any).__VUE__));
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

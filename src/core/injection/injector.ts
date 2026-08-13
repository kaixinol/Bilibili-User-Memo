import { querySelectorAllDeep } from "@/utils/query-dom";
import {
  type PageRule,
  StyleScope,
  DYNAMIC_SCAN_INTERVAL_MS,
} from "@/core/rules/rule-types";
import { logger } from "@/utils/logger";
import { extractUid } from "../dom/uid-extractor";
import { getElementDisplayName, resolveRuleTextTarget } from "../dom/text-utils";
import { refreshRenderedMemoNodes } from "../render/dom-refresh";
import { injectMemoRenderer } from "../render/renderer";

import { userStore, type UserStoreChange } from "../store/store";
import { createUrlMonitor, type UrlMonitor } from "./url-monitor";
import { syncSpaceProfile } from "./space-profile";
import type { BiliUser } from "../types";
import { unsafeWindow } from "$";
import type { ScanScope } from "./scan-scope";
import {
  buildMergedSelector,
  buildRuleSelector,
  containerSelectorList,
  getMatchedRules,
} from "./rule-runtime";
import { RemoteChangeBuffer } from "./remote-change-buffer";
import { waitUntil } from "@/utils/scheduler";
import {
  describeElementForDiagnostics,
  getLatestScan,
  getScopeType,
  recordLatestScan,
  recordRuleApplyDiagnostic,
  recordRuleScanDiagnostic,
} from "@/utils/perf-diagnostics";

class PageInjector {
  private domReady = false;
  private readonly urlMonitor: UrlMonitor;
  private readonly pendingRemoteChanges = new RemoteChangeBuffer();
  private readonly warnedRulePairs = new Set<string>();
  private matchedRules: PageRule[] = [];
  private scanTimer: number | null = null;

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
        this.scanAndInjectRulesBatch(this.matchedRules, document);
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
      this.scanAndInjectRulesBatch(this.matchedRules, document);
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

    this.matchedRules = getMatchedRules();

    if (this.matchedRules.length > 0) {
      this.scanAndInjectRulesBatch(this.matchedRules, document);
    }

    this.startScanTimer();
  }

  private startScanTimer() {
    if (this.scanTimer !== null) {
      clearInterval(this.scanTimer);
    }
    this.scanTimer = window.setInterval(() => {
      if (this.matchedRules.length > 0) {
        this.scanAndInjectRulesBatch(this.matchedRules, document);
      }
    }, DYNAMIC_SCAN_INTERVAL_MS);
  }

  private async scanAndInjectRulesBatch(
    rules: PageRule[],
    scope: ScanScope,
  ) {
    const merged = buildMergedSelector(rules);
    if (!merged) return;

    const scanStart = __IS_DEBUG__ ? performance.now() : 0;
    const elements = querySelectorAllDeep(merged, scope);
    let queryMs = 0;
    if (__IS_DEBUG__) {
      queryMs = performance.now() - scanStart;
      recordRuleScanDiagnostic({
        ruleName: rules.map((r) => r.name).join(","),
        mode: rules[0].container ? 2 : 1,
        selector: merged,
        scopeType: getScopeType(scope),
        matchCount: elements.length,
        queryMs,
        totalMs: queryMs,
      });
    }
    if (elements.length === 0) return;

    const selectorRules = rules
      .map((r) => {
        const sel = buildRuleSelector(r);
        return {
          selector: sel,
          matchSelector: sel
            ? sel.split(/[\s>+~]+/).pop()!
            : null,
          rule: r,
        };
      })
      .filter(
        (r): r is { selector: string; matchSelector: string; rule: PageRule } =>
          r.selector !== null,
      );

    const perRuleCounts: Record<string, number> = {};
    for (const { rule } of selectorRules) {
      perRuleCounts[rule.name] = 0;
    }
    for (const el of elements) {
      if (el.classList.contains("editable-textarea")) continue;

      let firstMatchedRule: string | null = null;

      for (const { matchSelector, rule } of selectorRules) {
        if (!el.matches(matchSelector)) continue;
        if (rule.container && !el.closest(containerSelectorList(rule.container))) continue;

        if (firstMatchedRule) {
          const pairKey = `${firstMatchedRule} & ${rule.name}`;
          if (!this.warnedRulePairs.has(pairKey)) {
            this.warnedRulePairs.add(pairKey);
            logger.warn(`[injector] Element matched by multiple rules: "${firstMatchedRule}" and "${rule.name}"`, el);
          }
        } else {
          firstMatchedRule = rule.name;
        }

        if (__IS_DEBUG__) perRuleCounts[rule.name]++;

        const storedUid =
          el.dataset.bilimemoUid ??
          resolveRuleTextTarget(el, rule)?.dataset.bilimemoUid;
        let preResolvedUid: string | null = null;
        if (storedUid) {
          const originalName =
            rule.originalNameResolver?.(el, rule) || getElementDisplayName(el, rule);
          preResolvedUid = await this.resolveElementUid(el, rule, originalName);
          if (preResolvedUid && storedUid === preResolvedUid) continue;
        }

        void this.applyRuleToElement(el, rule, preResolvedUid);
      }
    }

    if (__IS_DEBUG__) {
      const existing = getLatestScan();
      const mergedPerRuleCounts = existing
        ? { ...existing.perRuleCounts, ...perRuleCounts }
        : perRuleCounts;
      recordLatestScan({
        queryMs,
        totalMs: performance.now() - scanStart,
        perRuleCounts: mergedPerRuleCounts,
      });
    }
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
      if (rule.styleScope === StyleScope.Editable) {
        const sibling = el.nextElementSibling as HTMLElement | null;
        if (sibling?.classList.contains("editable-textarea") && sibling.dataset.bilimemoUid === uid) return;
      }
      const user = userStore.ensureUser(uid, originalName);
      applied = await injectMemoRenderer(el, user, rule, { uid, originalName });
    } finally {
      if (__IS_DEBUG__) {
        recordRuleApplyDiagnostic({
          ruleName: rule.name,
          mode: rule.container ? 2 : 1,
          element,
          uidResolved,
          applied,
          totalMs: performance.now() - applyStart,
        });
      }
    }
  }

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

/* TODO: QueryDOM区块，还是刷新的好快！
能不能:
TODO: 加一个搜索功能
TODO: 触发查询dom的文件标签（可按标签过滤）。
*/

/* QUESTION: 为啥`最近 - *`规则匹配到的元素明明是在用户不可见的地方静默更新的，可还是一直触发重扫
FIXME： dynamicWatch 开启 vs 不开启
*/

// FIXME: 高亮样式没有标注。
import Alpine from "alpinejs";
import { querySelectorAllDeep } from "@/utils/query-dom";
import { config as defaultRules } from "@/core/rules/rules";
import {
  InjectionMode,
  StyleScope,
  type DynamicTriggerConfig,
  type PageRule,
  type PollingTriggerConfig,
  type RuleConfigEntry,
} from "@/core/rules/rule-types";
import "@/styles/global.css";
import "@/styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";
import highlightCss from "@/styles/debugger-highlight.css?raw";
import { logger } from "@/utils/logger";
import {
  getPerfDiagnosticsSnapshot,
  recordFlowDiagnostic,
  recordLongTaskDiagnostic,
  type FlowDiagnostic,
  type LongTaskDiagnostic,
  type QueryDiagnostic,
  type RulePerfSummary,
} from "@/utils/perf-diagnostics";

const highlightSheet = new CSSStyleSheet();
highlightSheet.replaceSync(highlightCss);

const adoptedShadowRoots = new WeakSet<ShadowRoot>();
const HIGHLIGHT_CLASS = "debugger-highlight-active";

interface DebugRuleView {
  id: number;
  name: string;
  mode: InjectionMode;
  styleScope: StyleScope;
  selector: string;
  trigger?: string;
  matchCount: number;
  error?: string;
}

interface PerfStats {
  fps: number;
  longTasks: number;
  memory: string;
  slowRules: RulePerfSummary[];
  longTaskEvents: LongTaskDiagnostic[];
  recentFlows: FlowDiagnostic[];
  slowQueries: QueryDiagnostic[];
  recentQueries: QueryDiagnostic[];
}

interface DebuggerState {
  perfTimer: number | null;
  perfObserver: PerformanceObserver | null;
  perfRafId: number;
  containerElement: HTMLElement | null;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  currentTranslateX: number;
  currentTranslateY: number;
  rafId: number | null;
  containerWidth: number;
}

const state: DebuggerState = {
  perfTimer: null,
  perfObserver: null,
  perfRafId: 0,
  containerElement: null,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  currentTranslateX: 0,
  currentTranslateY: 0,
  rafId: null,
  containerWidth: 360,
};

interface MonkeyApp {
  selector: string;
  color: string;
  rules: DebugRuleView[];
  expandedRuleId: number | null;
  selectorError: string;
  selectorMatchCount: number;
  perf: PerfStats;
  init(): void;
  refreshRuleList(): void;
  scan(): void;
  clearHighlights(): void;
  updateDiagnostics(): void;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  startPerformanceMonitor(): void;
  toggleExpand(id: number): void;
  injectModeLabel(mode: InjectionMode): string;
  styleScopeLabel(scope: StyleScope): string;
  formatMs(value: number): string;
  formatTime(value: number): string;
  totalRuleMs(rule: RulePerfSummary): string;
}

function renderDebuggerUI(appName: string) {
  const div = document.createElement("div");
  div.id = "monkey-debugger-root";
  div.innerHTML = debuggerHtml.replace("${appName}", appName);
  document.body.appendChild(div);
}

function getRuleSelector(rule: PageRule): string {
  return rule.aSelector || rule.textSelector || "";
}

function getRuleTrigger(rule: PageRule): string | undefined {
  if (rule.injectMode === InjectionMode.Static) return undefined;
  if (rule.injectMode === InjectionMode.Dynamic) {
    const trigger = rule.trigger as DynamicTriggerConfig;
    return `${trigger.watch} / debounce ${trigger.interval}ms`;
  }
  const trigger = rule.trigger as PollingTriggerConfig;
  return `${trigger.watch} / interval ${trigger.interval}ms`;
}

function getMatchedRuleEntries(): RuleConfigEntry[] {
  const currentUrl = window.location.href;
  return defaultRules.filter((entry) => entry.urlPattern.test(currentUrl));
}

function countSelectorMatches(selector: string): { count: number; error?: string } {
  if (!selector) return { count: 0 };
  try {
    return { count: querySelectorAllDeep(selector).length };
  } catch {
    return { count: 0, error: "invalid selector" };
  }
}

function adoptStylesToShadowRoot(element: HTMLElement) {
  const shadowRoot = element.getRootNode();
  if (!(shadowRoot instanceof ShadowRoot)) return;
  if (adoptedShadowRoots.has(shadowRoot)) return;

  shadowRoot.adoptedStyleSheets = [
    ...shadowRoot.adoptedStyleSheets,
    highlightSheet,
  ];
  adoptedShadowRoots.add(shadowRoot);
}

function removeHighlightFromElement(element: HTMLElement) {
  element.classList.remove(HIGHLIGHT_CLASS);
  element.style.removeProperty("--overlay-color");
}

function clearAllHighlights() {
  document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
    if (element instanceof HTMLElement) removeHighlightFromElement(element);
  });

  try {
    querySelectorAllDeep(`.${HIGHLIGHT_CLASS}`).forEach((element) => {
      if (element instanceof HTMLElement) removeHighlightFromElement(element);
    });
  } catch (error) {
    logger.warn("[Debugger] Failed to clear Shadow DOM highlights:", error);
  }
}

export function initDebugger() {
  Alpine.data(
    "monkeyApp",
    (): MonkeyApp => ({
      selector: "",
      color: "#1976d2",
      rules: [],
      expandedRuleId: null,
      selectorError: "",
      selectorMatchCount: 0,
      perf: {
        fps: 0,
        longTasks: 0,
        memory: "n/a",
        slowRules: [],
        longTaskEvents: [],
        recentFlows: [],
        slowQueries: [],
        recentQueries: [],
      },

      init() {
        window.addEventListener("pointerup", (event) => {
          if (state.isDragging) this.onPointerUp(event);
        });
        window.addEventListener("pointermove", (event) => {
          if (state.isDragging) this.onPointerMove(event);
        });

        this.refreshRuleList();
        this.updateDiagnostics();
        this.scan();
        this.startPerformanceMonitor();

        requestAnimationFrame(() => {
          state.containerElement = document.querySelector(
            ".debugger-window",
          ) as HTMLElement | null;
          if (state.containerElement) {
            state.containerWidth = state.containerElement.offsetWidth || 360;
            state.currentTranslateX =
              window.innerWidth - state.containerWidth - 40;
            state.currentTranslateY = 20;
            state.containerElement.style.transform = `translate(${state.currentTranslateX}px, ${state.currentTranslateY}px)`;
          }
        });
      },

      refreshRuleList() {
        this.rules = getMatchedRuleEntries().map((entry, index) => {
          const rule = entry.rule;
          const selector = getRuleSelector(rule);
          const result = countSelectorMatches(selector);
          return {
            id: index + 1,
            name: rule.name,
            mode: rule.injectMode,
            styleScope: rule.styleScope,
            selector,
            trigger: getRuleTrigger(rule),
            matchCount: result.count,
            error: result.error,
          };
        });
      },

      scan() {
        clearAllHighlights();
        this.selectorError = "";
        this.selectorMatchCount = 0;

        const selector = this.selector.trim();
        if (!selector) {
          this.refreshRuleList();
          return;
        }

        const startedAt = performance.now();
        let elements: Element[];
        try {
          elements = querySelectorAllDeep(selector);
        } catch {
          this.selectorError = "Invalid selector";
          logger.warn(`[Debugger] Invalid selector: ${selector}`);
          return;
        }

        let visibleCount = 0;
        elements.forEach((element) => {
          if (!(element instanceof HTMLElement)) return;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          visibleCount += 1;
          adoptStylesToShadowRoot(element);
          element.style.setProperty("--overlay-color", this.color);
          element.classList.add(HIGHLIGHT_CLASS);
        });

        this.selectorMatchCount = visibleCount;
        this.refreshRuleList();
        if (__IS_DEBUG__) {
          recordFlowDiagnostic({
            source: "debugger manual scan",
            ruleCount: 1,
            durationMs: performance.now() - startedAt,
          });
        }
      },

      clearHighlights() {
        this.selector = "";
        this.selectorError = "";
        this.selectorMatchCount = 0;
        clearAllHighlights();
      },

      updateDiagnostics() {
        const snapshot = getPerfDiagnosticsSnapshot();
        this.perf.slowRules = snapshot.slowRules;
        this.perf.longTaskEvents = snapshot.longTasks.slice(0, 10);
        this.perf.recentFlows = snapshot.recentFlows.slice(0, 10);
        this.perf.slowQueries = snapshot.slowQueries.slice(0, 10);
        this.perf.recentQueries = snapshot.recentQueries.slice(0, 40);
      },

      onPointerDown(event: PointerEvent) {
        const target = event.target as HTMLElement;
        if (target.closest("input, button, select, textarea")) return;
        if (!target.closest("[data-drag-region]")) return;
        if (!state.containerElement) return;

        event.preventDefault();
        state.containerElement.setPointerCapture(event.pointerId);
        state.isDragging = true;
        state.dragStartX = event.clientX - state.currentTranslateX;
        state.dragStartY = event.clientY - state.currentTranslateY;
        state.containerElement.style.boxShadow = "none";
      },

      onPointerMove(event: PointerEvent) {
        if (!state.isDragging || !state.containerElement) return;

        let newX = event.clientX - state.dragStartX;
        let newY = event.clientY - state.dragStartY;

        const minX = 40 - state.containerWidth;
        const maxX = window.innerWidth - 40;
        const minY = 0;
        const maxY = window.innerHeight - 40;

        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));

        state.currentTranslateX = newX;
        state.currentTranslateY = newY;

        if (state.rafId === null) {
          state.rafId = window.requestAnimationFrame(() => {
            if (state.containerElement) {
              state.containerElement.style.transform = `translate(${state.currentTranslateX}px, ${state.currentTranslateY}px)`;
            }
            state.rafId = null;
          });
        }
      },

      onPointerUp(event: PointerEvent) {
        if (!state.containerElement) return;

        if (state.rafId !== null) {
          window.cancelAnimationFrame(state.rafId);
          state.rafId = null;
        }

        state.containerElement.style.transform = `translate(${state.currentTranslateX}px, ${state.currentTranslateY}px)`;
        state.containerElement.style.boxShadow = "";

        try {
          state.containerElement.releasePointerCapture(event.pointerId);
        } catch {}

        state.isDragging = false;
      },

      startPerformanceMonitor() {
        let lastTime = performance.now();
        let frames = 0;
        const tick = (time: number) => {
          frames += 1;
          const delta = time - lastTime;
          if (delta >= 1000) {
            this.perf.fps = Math.round((frames * 1000) / delta);
            frames = 0;
            lastTime = time;
          }
          state.perfRafId = window.requestAnimationFrame(tick);
        };
        state.perfRafId = window.requestAnimationFrame(tick);

        let longTasks = 0;
        if ("PerformanceObserver" in window) {
          try {
            state.perfObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries();
              longTasks += entries.length;
              if (__IS_DEBUG__) {
                entries.forEach((entry) =>
                  recordLongTaskDiagnostic(entry.duration, entry.startTime),
                );
              }
            });
            state.perfObserver.observe({ entryTypes: ["longtask"] });
          } catch {}
        }

        state.perfTimer = window.setInterval(() => {
          this.perf.longTasks = longTasks;
          longTasks = 0;
          const memory = (
            performance as Performance & {
              memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
            }
          ).memory;
          if (memory && typeof memory.usedJSHeapSize === "number") {
            const used = memory.usedJSHeapSize / 1048576;
            const limit = memory.jsHeapSizeLimit / 1048576;
            this.perf.memory = `${used.toFixed(1)} / ${limit.toFixed(0)} MB`;
          } else {
            this.perf.memory = "n/a";
          }
          this.refreshRuleList();
          this.updateDiagnostics();
        }, 1000);
      },

      toggleExpand(id) {
        this.expandedRuleId = this.expandedRuleId === id ? null : id;
      },

      injectModeLabel(mode) {
        switch (mode) {
          case InjectionMode.Static:
            return "Static";
          case InjectionMode.Dynamic:
            return "Dynamic";
          case InjectionMode.Polling:
            return "Polling";
        }
      },

      styleScopeLabel(scope) {
        switch (scope) {
          case StyleScope.Minimal:
            return "Minimal";
          case StyleScope.Editable:
            return "Editable";
        }
      },

      formatMs(value) {
        return `${value.toFixed(1)}ms`;
      },

      formatTime(value) {
        return new Date(value).toLocaleTimeString();
      },

      totalRuleMs(rule) {
        return `${(rule.scanMs + rule.applyMs).toFixed(1)}ms`;
      },
    }),
  );

  renderDebuggerUI("monkeyApp");
}

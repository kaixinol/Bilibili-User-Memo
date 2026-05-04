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
  isStaticMode,
  isDynamicMode,
} from "@/core/rules/rule-types";
import "@/styles/global.css";
import "@/styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";
import highlightCss from "@/styles/debugger-highlight.css?raw";
import { logger } from "@/utils/logger";
import {
  getPerfDiagnosticsSnapshot,
  recordLongTaskDiagnostic,
  type FlowDiagnostic,
  type LongTaskDiagnostic,
  type QueryDiagnostic,
  type RulePerfSummary,
} from "@/utils/perf-diagnostics";

const HIGHLIGHT_CLASS = "debugger-highlight-active";

const highlightStyleSheet = new CSSStyleSheet();
highlightStyleSheet.replaceSync(highlightCss);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, highlightStyleSheet];

const adoptedShadowRoots = new WeakSet<ShadowRoot>();

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
  ruleCountTimer: number | null;
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
  ruleCountTimer: null,
};

interface MonkeyApp {
  selector: string;
  color: string;
  rules: DebugRuleView[];
  expandedRuleId: number | null;
  selectorError: string;
  selectorMatchCount: number;
  showUnrelatedTasks: boolean;
  relatedLongTaskCount: number;
  perf: PerfStats;
  displayLongTaskEvents: LongTaskDiagnostic[];
  scanTimer: number | null;
  init(): void;
  refreshRuleList(): void;
  scan(): void;
  _runScan(): void;
  clearHighlights(): void;
  applyHighlightColor(color: string): void;
  updateDiagnostics(): void;
  startRuleCountRefresh(): void;
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
  if (isStaticMode(rule)) return undefined;
  if (isDynamicMode(rule)) {
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

function adoptHighlightToRoot(element: HTMLElement) {
  const root = element.getRootNode();
  if (!(root instanceof ShadowRoot)) return;
  if (adoptedShadowRoots.has(root)) return;
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, highlightStyleSheet];
  adoptedShadowRoots.add(root);
}

let _highlightedElements = new Set<HTMLElement>();

function clearAllHighlights() {
  _highlightedElements.forEach((el) => el.classList.remove(HIGHLIGHT_CLASS));
  _highlightedElements = new Set();
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
      showUnrelatedTasks: false,
      relatedLongTaskCount: 0,
      scanTimer: null,
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

      get displayLongTaskEvents() {
        if (this.showUnrelatedTasks) {
          return this.perf.longTaskEvents;
        }
        return this.perf.longTaskEvents.filter(
          (task) => task.relatedKind !== "unrelated",
        );
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
        this.startRuleCountRefresh();
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
        if (this.scanTimer !== null) {
          clearInterval(this.scanTimer);
          this.scanTimer = null;
        }

        this._runScan();

        this.scanTimer = window.setInterval(() => {
          this._runScan();
        }, 500);
      },

      _runScan() {
        this.selectorError = "";
        this.selectorMatchCount = 0;

        const selector = this.selector.trim();
        if (!selector) {
          if (_highlightedElements.size > 0) {
            clearAllHighlights();
          }
          return;
        }

        let elements: Element[];
        try {
          elements = querySelectorAllDeep(selector);
        } catch {
          this.selectorError = "Invalid selector";
          logger.warn(`[Debugger] Invalid selector: ${selector}`);
          return;
        }

        const newSet = new Set<HTMLElement>();
        let visibleCount = 0;
        elements.forEach((element) => {
          if (!(element instanceof HTMLElement)) return;
          const rect = element.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) return;
          visibleCount += 1;
          adoptHighlightToRoot(element);
          newSet.add(element);
        });

        // Remove highlights from elements no longer matched
        _highlightedElements.forEach((el) => {
          if (!newSet.has(el)) {
            el.classList.remove(HIGHLIGHT_CLASS);
          }
        });

        // Add highlights to newly matched elements
        newSet.forEach((el) => {
          if (!_highlightedElements.has(el)) {
            el.classList.add(HIGHLIGHT_CLASS);
          }
        });

        _highlightedElements = newSet;
        this.selectorMatchCount = visibleCount;
        this.applyHighlightColor(this.color);
      },

      clearHighlights() {
        if (this.scanTimer !== null) {
          clearInterval(this.scanTimer);
          this.scanTimer = null;
        }
        this.selector = "";
        this.selectorError = "";
        this.selectorMatchCount = 0;
        clearAllHighlights();
      },

      applyHighlightColor(color: string) {
        document.documentElement.style.setProperty(
          "--debugger-highlight-color",
          color,
        );
      },

      updateDiagnostics() {
        const snapshot = getPerfDiagnosticsSnapshot();
        this.perf.slowRules = snapshot.slowRules;
        this.perf.longTaskEvents = snapshot.longTasks.slice(0, 10);
        this.relatedLongTaskCount = snapshot.longTasks.filter(
          (task) => task.relatedKind !== "unrelated",
        ).length;
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
        } catch { }

        state.isDragging = false;
      },

      startRuleCountRefresh() {
        state.ruleCountTimer = window.setInterval(() => {
          this.refreshRuleList();
        }, 4000);
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
          } catch { }
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

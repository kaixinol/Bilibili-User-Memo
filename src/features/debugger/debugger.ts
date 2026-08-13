import Alpine from "alpinejs";
import { querySelectorAllDeep } from "@/utils/query-dom";
import { config as defaultRules } from "@/core/rules/rules";
import {
  StyleScope,
  type RuleConfigEntry,
} from "@/core/rules/rule-types";
import { buildRuleSelector } from "@/core/injection/rule-runtime";
import {
  getLatestScan,
  recordLongTaskDiagnostic,
  setScanUpdateListener,
} from "@/utils/perf-diagnostics";
import "@/styles/global.css";
import "@/styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";
import highlightCss from "@/styles/debugger-highlight.css?raw";
import { logger } from "@/utils/logger";
import { setShowOriginalInDebug } from "@/core/render/renderer";
import { persistWithGmStorage } from "@/utils/gm-storage";

const HIGHLIGHT_CLASS = "debugger-highlight-active";

const highlightStyleSheet = new CSSStyleSheet();
highlightStyleSheet.replaceSync(highlightCss);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, highlightStyleSheet];

const adoptedShadowRoots = new WeakSet<ShadowRoot>();

interface PerfStats {
  fps: number;
  memory: string;
}

interface DebugRuleView {
  id: number;
  name: string;
  styleScope: StyleScope;
  selector: string;
  container?: string;
  matchCount: number;
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
  perf: PerfStats;
  batchQueryMs: number;
  scanTimer: number | null;
  showOriginalName: boolean;
  autoOpenPanel: boolean;
  init(): void;
  refreshRuleList(): void;
  scan(): void;
  _runScan(): void;
  clearHighlights(): void;
  applyHighlightColor(color: string): void;
  startPerformanceMonitor(): void;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  toggleExpand(id: number): void;
  toggleShowOriginalName(event: Event): void;
  styleScopeLabel(scope: StyleScope): string;
  formatMs(value: number): string;
}

function renderDebuggerUI(appName: string) {
  const div = document.createElement("div");
  div.id = "monkey-debugger-root";
  div.innerHTML = debuggerHtml.replace("${appName}", appName);
  document.body.appendChild(div);
}

function getMatchedRuleEntries(): RuleConfigEntry[] {
  const currentUrl = location.href;
  return defaultRules.filter((entry) => entry.urlPattern.test(currentUrl));
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
      perf: {
        fps: 0,
        memory: "n/a",
      },
      batchQueryMs: 0,
      scanTimer: null,
      showOriginalName: false,
      autoOpenPanel: persistWithGmStorage("debug.autoOpenPanel", false),

      init() {
        window.addEventListener("pointerup", (event) => {
          if (state.isDragging) this.onPointerUp(event);
        });
        window.addEventListener("pointermove", (event) => {
          if (state.isDragging) this.onPointerMove(event);
        });

        this.refreshRuleList();
        this.scan();
        this.startPerformanceMonitor();
        setScanUpdateListener(() => this.refreshRuleList());

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
        const snapshot = getLatestScan();
        this.batchQueryMs = snapshot?.queryMs ?? 0;

        this.rules = getMatchedRuleEntries().map((entry, index) => {
          const rule = entry.rule;
          const selector = buildRuleSelector(rule) || "";
          return {
            id: index + 1,
            name: rule.name,
            styleScope: rule.styleScope,
            selector,
            container: Array.isArray(rule.container)
              ? rule.container.join(", ")
              : rule.container,
            matchCount: snapshot?.perRuleCounts[rule.name] ?? 0,
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
        const selector = this.selector.trim();
        if (!selector) {
          if (_highlightedElements.size > 0) {
            clearAllHighlights();
          }
          return;
        }

        let elements: Element[];
        try {
          elements = querySelectorAllDeep(selector, document);
        } catch {
          logger.warn(`[Debugger] Invalid selector: ${selector}`);
          return;
        }

        const newSet = new Set<HTMLElement>();
        elements.forEach((element) => {
          if (!(element instanceof HTMLElement)) return;
          adoptHighlightToRoot(element);
          newSet.add(element);
        });

        _highlightedElements.forEach((el) => {
          if (!newSet.has(el)) {
            el.classList.remove(HIGHLIGHT_CLASS);
          }
        });

        newSet.forEach((el) => {
          if (!_highlightedElements.has(el)) {
            el.classList.add(HIGHLIGHT_CLASS);
          }
        });

        _highlightedElements = newSet;
        this.applyHighlightColor(this.color);
      },

      clearHighlights() {
        if (this.scanTimer !== null) {
          clearInterval(this.scanTimer);
          this.scanTimer = null;
        }
        this.selector = "";
        clearAllHighlights();
      },

      applyHighlightColor(color: string) {
        document.documentElement.style.setProperty(
          "--debugger-highlight-color",
          color,
        );
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

        if ("PerformanceObserver" in window) {
          try {
            state.perfObserver = new PerformanceObserver((list) => {
              const entries = list.getEntries();
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
        }, 1000);
      },

      toggleExpand(id) {
        this.expandedRuleId = this.expandedRuleId === id ? null : id;
      },

      toggleShowOriginalName(event) {
        const checked = (event.target as HTMLInputElement).checked;
        this.showOriginalName = checked;
        setShowOriginalInDebug(checked);
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
    }),
  );

  renderDebuggerUI("monkeyApp");
}

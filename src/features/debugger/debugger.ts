// TODO: 修复debugger面板的大量死代码，逻辑冲突的代码，冗余代码
// FIXME: dev模式下，有时点不了editable-area
// FIXME: 面板的注入样式显示不一致

import Alpine from 'alpinejs'
import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { config as defaultRules } from "@/core/rules/rules";
import {
  InjectionMode,
  StyleScope,
  type DynamicTriggerConfig,
  type PollingTriggerConfig,
  type RuleConfigEntry,
} from "@/core/rules/rule-types";
import "@/styles/global.css";
import "@/styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";
import highlightCss from "@/styles/debugger-highlight.css?raw";
import { logger } from "@/utils/logger";

// --- Constructable Stylesheet for Shadow DOM support ---
// Import shared highlight styles from standalone CSS file to maintain single source of truth
const highlightSheet = new CSSStyleSheet();
highlightSheet.replaceSync(highlightCss);

// Track which ShadowRoots have already adopted the stylesheet to avoid duplicates
const adoptedShadowRoots = new WeakSet<ShadowRoot>();

// Check if mutations affect the debugger window itself
function hasDebuggerMutation(mutations: MutationRecord[]): boolean {
  return mutations.some((m) => {
    if (m.target instanceof HTMLElement && m.target.closest('.debugger-window')) {
      return true;
    }
    if (m.addedNodes.length > 0) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && node.closest('.debugger-window')) {
          return true;
        }
      }
    }
    return false;
  });
}

// --- 類型定義 ---
interface DebugRule {
  id: number;
  color: string;
  active: boolean;
  // PageRule properties (editable copy)
  name: string;
  styleScope: StyleScope;
  aSelector?: string;
  textSelector?: string;
  textSource: "self" | "watch";
  ignoreProcessed: boolean;
  matchByName: boolean;
  injectMode: InjectionMode;
  // Dynamic-specific
  trigger?: DynamicTriggerConfig | PollingTriggerConfig;
  dynamicWatch?: boolean;
}

interface PerfStats {
  fps: number;
  longTasks: number;
  memory: string;
}

// Non-reactive state stored outside Alpine
interface DebuggerState {
  observer: MutationObserver | null;
  perfTimer: number | null;
  perfObserver: PerformanceObserver | null;
  perfRafId: number;
  containerElement: HTMLElement | null;
  dynamicObservers: Map<string, MutationObserver>;
  pollingTimers: Map<number, number>;
  isDragging: boolean;
  dragStartX: number;
  dragStartY: number;
  currentTranslateX: number;
  currentTranslateY: number;
  rafId: number | null;
  containerWidth: number;
}

const state: DebuggerState = {
  observer: null,
  perfTimer: null,
  perfObserver: null,
  perfRafId: 0,
  containerElement: null,
  dynamicObservers: new Map(),
  pollingTimers: new Map(),
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
  rules: DebugRule[];
  nextId: number;
  perf: PerfStats;
  expandedRuleId: number | null;
  init(): void;
  setupObservers(): void;
  setupDynamicObservers(): void;
  setupPollingTimers(): void;
  clearDynamicObservers(): void;
  addRule(): void;
  removeRule(id: number): void;
  toggleRule(id: number): void;
  toggleExpand(id: number): void;
  updateRuleName(id: number, name: string): void;
  updateASelector(id: number, selector: string): void;
  updateTextSelector(id: number, selector: string): void;
  updateStyleScope(id: number, styleScope: number): void;
  updateTriggerWatch(id: number, watch: string): void;
  updateTriggerInterval(id: number, interval: number): void;
  updateDynamicWatch(id: number, checked: boolean): void;
  updateMatchByName(id: number, checked: boolean): void;
  updateIgnoreProcessed(id: number, checked: boolean): void;
  updateInjectMode(id: number, mode: InjectionMode): void;
  updateRuleColor(id: number, color: string): void;
  scan(): void;
  adoptStylesToShadowRoot(element: HTMLElement): void;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
  startPerformanceMonitor(): void;
  getTriggerConfig(rule: DebugRule): DynamicTriggerConfig | PollingTriggerConfig | undefined;
  isDynamic(rule: DebugRule): boolean;
  isPolling(rule: DebugRule): boolean;
  isStatic(rule: DebugRule): boolean;
  styleScopeOptions(): { value: number; label: string }[];
  injectModeOptions(): { value: InjectionMode; label: string }[];
  injectModeLabel(mode: InjectionMode): string;
  styleScopeLabel(scope: StyleScope): string;
}
export function getCaller() {
  const stack = new Error().stack?.split("\n");
  return stack?.[3]?.trim(); // 0是Error，1是当前函数，2是中间层，3通常是调用者
}
// 這裡糅合了原本 panel.ts 的模版渲染邏輯
function renderDebuggerUI(appName: string) {
  const div = document.createElement("div");
  div.id = "monkey-debugger-root";
  div.innerHTML = debuggerHtml.replace("${appName}", appName);
  document.body.appendChild(div);
}

function cloneEntryAsDebugRule(
  entry: RuleConfigEntry,
  index: number,
): DebugRule {
  const rule = entry.rule;
  const base: DebugRule = {
    id: index + 1,
    color: "#1976d2",
    active: true,
    name: rule.name,
    styleScope: rule.styleScope,
    aSelector: rule.aSelector,
    textSelector: rule.textSelector,
    textSource: rule.textSource,
    ignoreProcessed: rule.ignoreProcessed,
    matchByName: rule.matchByName,
    injectMode: rule.injectMode,
  };
  if (rule.injectMode === InjectionMode.Dynamic) {
    base.trigger = { ...rule.trigger };
    base.dynamicWatch = rule.dynamicWatch;
  } else if (rule.injectMode === InjectionMode.Polling) {
    base.trigger = { ...rule.trigger };
  }
  return base;
}

export function initDebugger() {
  const debounce =
    (Alpine as typeof Alpine & {
      debounce?: <T extends (...args: never[]) => void>(
        callback: T,
        wait: number,
      ) => T;
    }).debounce ??
    ((callback: () => void, wait: number) => {
      let timerId: number | null = null;
      return () => {
        if (timerId) window.clearTimeout(timerId);
        timerId = window.setTimeout(() => {
          timerId = null;
          callback();
        }, wait);
      };
    });

  Alpine.data(
    "monkeyApp",
    (): MonkeyApp => ({
      selector: "",
      color: "#1976d2",
      rules: [],
      nextId: 1000,
      perf: {
        fps: 0,
        longTasks: 0,
        memory: "n/a",
      },
      expandedRuleId: null,

      init() {
        for (let i = 0; i < defaultRules.length; i++) {
          this.rules.push(cloneEntryAsDebugRule(defaultRules[i], i));
        }

        window.addEventListener("pointerup", (e) => {
          if (state.isDragging) this.onPointerUp(e);
        });
        window.addEventListener("pointermove", (e) => {
          if (state.isDragging) this.onPointerMove(e);
        });
        this.setupObservers();
        this.setupDynamicObservers();
        this.setupPollingTimers();
        this.scan();
        this.startPerformanceMonitor();

        requestAnimationFrame(() => {
          state.containerElement = document.querySelector(".debugger-window") as HTMLElement | null;
          if (state.containerElement) {
            state.containerWidth = state.containerElement.offsetWidth || 360;
            state.currentTranslateX = window.innerWidth - state.containerWidth - 40;
            state.currentTranslateY = 20;
            state.containerElement.style.transform = `translate(${state.currentTranslateX}px, ${state.currentTranslateY}px)`;
          }
        });
      },

      setupObservers() {
        const debouncedScan = debounce(() => {
          if (state.isDragging) return;
          this.scan();
        }, 200);

        state.observer = new MutationObserver((mutations) => {
          if (state.isDragging || hasDebuggerMutation(mutations)) return;
          debouncedScan();
        });

        const observeTarget = document.querySelector('#app') || document.body;
        state.observer.observe(observeTarget, {
          childList: true,
          subtree: true,
        });
      },

      setupDynamicObservers() {
        state.dynamicObservers.forEach(observer => observer.disconnect());
        state.dynamicObservers.clear();

        const watchSelectors = new Set<string>();
        this.rules.forEach(rule => {
          if (rule.active && this.isDynamic(rule) && rule.trigger) {
            watchSelectors.add(rule.trigger.watch);
          }
        });

        // Create observers for each unique watch selector
        watchSelectors.forEach(watchSelector => {
          const debouncedScan = debounce(() => {
            if (state.isDragging) return;
            this.scan();
          }, 200);

          const observer = new MutationObserver((mutations) => {
            if (state.isDragging || hasDebuggerMutation(mutations)) return;
            debouncedScan();
          });

          const watchTarget = querySelectorAllDeep(watchSelector);
          watchTarget.forEach(target => {
            if (target instanceof HTMLElement) {
              observer.observe(target, { childList: true, subtree: true });
            }
          });

          state.dynamicObservers.set(watchSelector, observer);
        });
      },

      setupPollingTimers() {
        state.pollingTimers.forEach(timerId => clearInterval(timerId));
        state.pollingTimers.clear();

        this.rules.forEach(rule => {
          if (rule.active && this.isPolling(rule) && rule.trigger) {
            const intervalMs = (rule.trigger as PollingTriggerConfig).intervalMs;
            const timerId = window.setInterval(() => {
              if (state.isDragging) return;
              this.scan();
            }, intervalMs);
            state.pollingTimers.set(rule.id, timerId);
          }
        });
      },

      clearDynamicObservers() {
        state.dynamicObservers.forEach(observer => observer.disconnect());
        state.dynamicObservers.clear();
        state.pollingTimers.forEach(timerId => clearInterval(timerId));
        state.pollingTimers.clear();
      },

      addRule() {
        const trimmed = (this.selector || "").trim();
        if (!trimmed) return;
        this.rules.push({
          id: this.nextId++,
          name: "自訂",
          styleScope: StyleScope.Minimal,
          aSelector: trimmed,
          textSource: "self",
          ignoreProcessed: false,
          matchByName: false,
          injectMode: InjectionMode.Static,
          color: this.color,
          active: true,
        });
        this.selector = "";
        this.setupDynamicObservers();
        this.setupPollingTimers();
        this.scan();
      },
      removeRule(id) {
        this.rules = this.rules.filter((r) => r.id !== id);
        this.setupDynamicObservers();
        this.setupPollingTimers();
        this.scan();
      },
      toggleRule(id) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.active = !r.active;
          this.setupDynamicObservers();
          this.setupPollingTimers();
          this.scan();
        }
      },
      toggleExpand(id) {
        this.expandedRuleId = this.expandedRuleId === id ? null : id;
      },

      updateRuleName(id, name) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.name = name;
      },
      updateASelector(id, selector) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.aSelector = selector || undefined;
          this.scan();
        }
      },
      updateTextSelector(id, selector) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.textSelector = selector || undefined;
        }
      },
      updateStyleScope(id, styleScope) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.styleScope = styleScope;
      },
      updateTriggerWatch(id, watch) {
        const r = this.rules.find((x) => x.id === id);
        if (r && r.trigger) {
          r.trigger.watch = watch;
          this.setupDynamicObservers();
        }
      },
      updateTriggerInterval(id, interval) {
        const r = this.rules.find((x) => x.id === id);
        if (r && r.trigger) {
          if (r.injectMode === InjectionMode.Dynamic) {
            (r.trigger as DynamicTriggerConfig).debounceMs = interval;
          } else {
            (r.trigger as PollingTriggerConfig).intervalMs = interval;
            // Restart polling timer with new interval
            this.setupPollingTimers();
          }
        }
      },
      updateDynamicWatch(id, checked) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.dynamicWatch = checked;
      },
      updateMatchByName(id, checked) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.matchByName = checked;
      },
      updateIgnoreProcessed(id, checked) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.ignoreProcessed = checked;
      },
      updateInjectMode(id, mode) {
        const r = this.rules.find((x) => x.id === id);
        if (!r || r.injectMode === mode) return;
        const oldMode = r.injectMode;
        r.injectMode = mode;

        // Migrate trigger data between modes
        if (mode === InjectionMode.Static) {
          delete r.trigger;
          delete r.dynamicWatch;
        } else if (mode === InjectionMode.Dynamic) {
          if (oldMode === InjectionMode.Polling && r.trigger) {
            // Polling → Dynamic: convert intervalMs to debounceMs
            r.trigger = {
              watch: (r.trigger as PollingTriggerConfig).watch,
              debounceMs: (r.trigger as PollingTriggerConfig).intervalMs,
            };
          } else if (!r.trigger) {
            r.trigger = { watch: "#app", debounceMs: 1000 };
          }
          if (r.dynamicWatch === undefined) r.dynamicWatch = false;
        } else if (mode === InjectionMode.Polling) {
          if (oldMode === InjectionMode.Dynamic && r.trigger) {
            // Dynamic → Polling: convert debounceMs to intervalMs
            r.trigger = {
              watch: (r.trigger as DynamicTriggerConfig).watch,
              intervalMs: (r.trigger as DynamicTriggerConfig).debounceMs,
            };
          } else if (!r.trigger) {
            r.trigger = { watch: "#app", intervalMs: 2000 };
          }
          delete r.dynamicWatch;
        }

        this.setupDynamicObservers();
        this.setupPollingTimers();
        this.scan();
      },
      updateRuleColor(id, color) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.color = color;
          this.scan();
        }
      },

      /**
       * Adopt the highlight stylesheet to an element's ShadowRoot if needed
       */
      adoptStylesToShadowRoot(element: HTMLElement) {
        const shadowRoot = element.getRootNode();
        if (shadowRoot instanceof ShadowRoot && !adoptedShadowRoots.has(shadowRoot)) {
          shadowRoot.adoptedStyleSheets = [
            ...shadowRoot.adoptedStyleSheets,
            highlightSheet,
          ];
          adoptedShadowRoots.add(shadowRoot);
        }
      },

      scan() {
        if (state.isDragging) return;

        const shouldBeHighlighted = new Set<HTMLElement>();
        const elementColorMap = new Map<HTMLElement, string>();

        for (const rule of this.rules) {
          if (!rule.active) continue;
          const sel = rule.aSelector?.trim();
          if (!sel) continue;
          let elements: Element[];
          try {
            elements = querySelectorAllDeep(sel);
          } catch {
            logger.warn(`[Debugger] Invalid selector: ${sel}`);
            continue;
          }

          for (const el of elements) {
            if (!(el instanceof HTMLElement)) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            shouldBeHighlighted.add(el);
            elementColorMap.set(el, rule.color);
            this.adoptStylesToShadowRoot(el);
          }
        }

        // Remove stale highlights from main document
        const currentlyHighlighted = document.querySelectorAll('.debugger-highlight-active');
        currentlyHighlighted.forEach(el => {
          if (el instanceof HTMLElement && !shouldBeHighlighted.has(el)) {
            el.classList.remove('debugger-highlight-active');
            el.style.removeProperty('--overlay-color');
          }
        });

        // Also check Shadow DOM
        try {
          const shadowHighlighted = querySelectorAllDeep('.debugger-highlight-active');
          shadowHighlighted.forEach(el => {
            if (el instanceof HTMLElement && !shouldBeHighlighted.has(el)) {
              el.classList.remove('debugger-highlight-active');
              el.style.removeProperty('--overlay-color');
            }
          });
        } catch (error) {
          logger.warn('[Debugger] Failed to check Shadow DOM highlights:', error);
        }

        // Apply highlights
        shouldBeHighlighted.forEach(el => {
          const color = elementColorMap.get(el);
          if (color) {
            el.style.setProperty('--overlay-color', color);
            el.classList.add('debugger-highlight-active');
          }
        });
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
        state.containerElement.style.boxShadow = 'none';
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
        state.containerElement.style.boxShadow = '';

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
              longTasks += list.getEntries().length;
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
        }, 1000);
      },

      getTriggerConfig(rule: DebugRule) {
        return rule.trigger;
      },
      isDynamic(rule: DebugRule) {
        return rule.injectMode === InjectionMode.Dynamic;
      },
      isPolling(rule: DebugRule) {
        return rule.injectMode === InjectionMode.Polling;
      },
      isStatic(rule: DebugRule) {
        return rule.injectMode === InjectionMode.Static;
      },
      styleScopeOptions() {
        return [
          { value: StyleScope.Minimal, label: "Minimal" },
          { value: StyleScope.Editable, label: "Editable" },
        ];
      },
      injectModeOptions() {
        return [
          { value: InjectionMode.Static, label: "Static" },
          { value: InjectionMode.Dynamic, label: "Dynamic" },
          { value: InjectionMode.Polling, label: "Polling" },
        ];
      },
      injectModeLabel(mode: InjectionMode) {
        switch (mode) {
          case InjectionMode.Static: return "Static";
          case InjectionMode.Dynamic: return "Dynamic";
          case InjectionMode.Polling: return "Polling";
        }
      },
      styleScopeLabel(scope: StyleScope) {
        switch (scope) {
          case StyleScope.Minimal: return "Minimal";
          case StyleScope.Editable: return "Editable";
        }
      },
    }),
  );

  renderDebuggerUI("monkeyApp");
}

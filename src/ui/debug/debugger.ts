import Alpine from "alpinejs";
import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { config as defaultRules } from "../../configs/rules";
import {
  InjectionMode,
  StyleScope,
  type DynamicTriggerConfig,
  type PollingTriggerConfig,
  type RuleConfigEntry,
} from "../../configs/rule-types";
import "../../styles/global.css";
import "../../styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";
import highlightCss from "../../styles/debugger-highlight.css?raw";
import { logger } from "../../utils/logger";

// --- Constructable Stylesheet for Shadow DOM support ---
// Import shared highlight styles from standalone CSS file to maintain single source of truth
const highlightSheet = new CSSStyleSheet();
highlightSheet.replaceSync(highlightCss);

// Track which ShadowRoots have already adopted the stylesheet to avoid duplicates
const adoptedShadowRoots = new WeakSet<ShadowRoot>();

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
  fontSize?: string;
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
  debounceTimer: number | null;
  perfTimer: number | null;
  perfObserver: PerformanceObserver | null;
  perfRafId: number;
}

const state: DebuggerState = {
  observer: null,
  debounceTimer: null,
  perfTimer: null,
  perfObserver: null,
  perfRafId: 0,
};

interface MonkeyApp {
  selector: string;
  color: string;
  left: number;
  top: number;
  dragging: boolean;
  offsetX: number;
  offsetY: number;
  rules: DebugRule[];
  nextId: number;
  perf: PerfStats;
  expandedRuleId: number | null;
  init(): void;
  setupObservers(): void;
  addRule(): void;
  removeRule(id: number): void;
  toggleRule(id: number): void;
  toggleExpand(id: number): void;
  updateRuleName(id: number, name: string): void;
  updateASelector(id: number, selector: string): void;
  updateTextSelector(id: number, selector: string): void;
  updateStyleScope(id: number, styleScope: number): void;
  updateFontSize(id: number, fontSize: string): void;
  updateTriggerWatch(id: number, watch: string): void;
  updateTriggerInterval(id: number, interval: number): void;
  updateDynamicWatch(id: number, checked: boolean): void;
  updateMatchByName(id: number, checked: boolean): void;
  updateIgnoreProcessed(id: number, checked: boolean): void;
  updateInjectMode(id: number, mode: InjectionMode): void;
  updateRuleColor(id: number, color: string): void;
  scan(): void;
  adoptStylesToShadowRoot(element: HTMLElement): void;
  clearAllHighlights(): void;
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
    fontSize: rule.fontSize,
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
  Alpine.data(
    "monkeyApp",
    (): MonkeyApp => ({
      selector: "",
      color: "#1976d2",
      left: window.innerWidth - 360,
      top: 20,
      dragging: false,
      offsetX: 0,
      offsetY: 0,
      rules: [],
      nextId: 1000,
      // Note: observer, perfTimer, etc. are now in non-reactive state object
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
          if (this.dragging) this.onPointerUp(e);
        });
        window.addEventListener("pointermove", (e) => {
          if (this.dragging) this.onPointerMove(e);
        });
        this.setupObservers();
        this.scan();
        this.startPerformanceMonitor();
      },

      setupObservers() {
        const debouncedScan = () => {
          if (state.debounceTimer) window.clearTimeout(state.debounceTimer);
          state.debounceTimer = window.setTimeout(() => {
            this.scan();
          }, 200);
        };
        
        state.observer = new MutationObserver((mutations) => {
          // Skip mutations that affect the debugger window itself
          const hasDebuggerMutation = mutations.some((m) => {
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
          
          if (hasDebuggerMutation) {
            return;
          }
          
          debouncedScan();
        });
        
        // Narrow observation scope to #app if it exists, otherwise fallback to body
        const observeTarget = document.querySelector('#app') || document.body;
        state.observer.observe(observeTarget, {
          childList: true,
          subtree: true,
        });
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
        this.scan();
      },
      removeRule(id) {
        this.rules = this.rules.filter((r) => r.id !== id);
        this.scan();
      },
      toggleRule(id) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.active = !r.active;
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
      updateFontSize(id, fontSize) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.fontSize = fontSize || undefined;
      },
      updateTriggerWatch(id, watch) {
        const r = this.rules.find((x) => x.id === id);
        if (r && r.trigger) r.trigger.watch = watch;
      },
      updateTriggerInterval(id, interval) {
        const r = this.rules.find((x) => x.id === id);
        if (r && r.trigger) {
          if (r.injectMode === InjectionMode.Dynamic) {
            (r.trigger as DynamicTriggerConfig).debounceMs = interval;
          } else {
            (r.trigger as PollingTriggerConfig).intervalMs = interval;
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
          // Adopt the stylesheet to this ShadowRoot
          shadowRoot.adoptedStyleSheets = [
            ...shadowRoot.adoptedStyleSheets,
            highlightSheet,
          ];
          adoptedShadowRoots.add(shadowRoot);
        }
      },

      /**
       * Clear all highlights from the entire document including all Shadow DOMs
       */
      clearAllHighlights() {
        // Clear highlights from main document
        const highlightedElements = document.querySelectorAll('.debugger-highlight-active');
        highlightedElements.forEach(el => {
          if (el instanceof HTMLElement) {
            el.classList.remove('debugger-highlight-active');
            el.style.removeProperty('--overlay-color');
          }
        });

        // Clear highlights from all Shadow DOMs using deep query
        try {
          const shadowHighlighted = querySelectorAllDeep('.debugger-highlight-active');
          shadowHighlighted.forEach(el => {
            if (el instanceof HTMLElement) {
              el.classList.remove('debugger-highlight-active');
              el.style.removeProperty('--overlay-color');
            }
          });
        } catch (error) {
          logger.warn('[Debugger] Failed to clear Shadow DOM highlights:', error);
        }
      },

      scan() {
        // Step 1: Clear all existing highlights from entire document (including Shadow DOM)
        this.clearAllHighlights();
        
        // Step 2: Apply new highlights
        for (const rule of this.rules) {
          if (!rule.active) continue;
          const sel = rule.aSelector?.trim();
          if (!sel) continue;
          let elements: Element[];
          try {
            // Use deep query to find elements in Shadow DOM
            elements = querySelectorAllDeep(sel);
          } catch {
            logger.warn(`[Debugger] Invalid selector: ${sel}`);
            continue;
          }
          for (const el of elements) {
            if (!(el instanceof HTMLElement)) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;
            
            // Set CSS custom property for color
            el.style.setProperty('--overlay-color', rule.color);
            
            // Add highlight class
            el.classList.add('debugger-highlight-active');
            
            // Ensure styles work in Shadow DOM by adopting stylesheet
            this.adoptStylesToShadowRoot(el);
          }
        }
      },

      onPointerDown(event: PointerEvent) {
        const target = event.target as HTMLElement;
        if (target.closest("input, button, select, textarea")) return;
        const dragRegion = target.closest("[data-drag-region]");
        if (!dragRegion) return;
        const container = document.querySelector(
          ".debugger-window",
        ) as HTMLElement;
        if (container) {
          container.setPointerCapture(event.pointerId);
          this.dragging = true;
          this.offsetX = event.clientX - this.left;
          this.offsetY = event.clientY - this.top;
        }
      },

      onPointerMove(event: PointerEvent) {
        if (!this.dragging) return;
        const container = document.querySelector(
          ".debugger-window",
        ) as HTMLElement | null;
        const width = container?.offsetWidth ?? 340;
        let newLeft = event.clientX - this.offsetX;
        let newTop = event.clientY - this.offsetY;
        const minLeft = 40 - width;
        const maxLeft = window.innerWidth - 40;
        this.left = Math.max(minLeft, Math.min(maxLeft, newLeft));
        this.top = Math.max(0, Math.min(window.innerHeight - 40, newTop));
      },

      onPointerUp(event: PointerEvent) {
        this.dragging = false;
        const container = document.querySelector(
          ".debugger-window",
        ) as HTMLElement;
        if (container && event.pointerId) {
          try {
            container.releasePointerCapture(event.pointerId);
          } catch {}
        }
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

import Alpine from "alpinejs";
import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { config as defaultRules } from "../../configs/rules";
import "../../styles/global.css"
import "../../styles/debugger.css";
import debuggerHtml from "./debugger.html?raw";

// --- 类型定义 ---
interface RuleItem {
  id: number;
  name: string;
  selector: string;
  color: string;
  active: boolean;
}

interface OverlayPair {
  target: HTMLElement;
  box: HTMLElement;
}

interface MonkeyApp {
  selector: string;
  color: string;
  left: number;
  top: number;
  dragging: boolean;
  offsetX: number;
  offsetY: number;
  rules: RuleItem[];
  nextId: number;
  overlays: OverlayPair[];
  overlayContainer: HTMLElement | null;
  observer: MutationObserver | null;
  debounceTimer: number | null;
  init(): void;
  setupObservers(): void;
  addRule(): void;
  removeRule(id: number): void;
  toggleRule(id: number): void;
  updateRuleName(id: number, name: string): void;
  updateRuleSelector(id: number, selector: string): void;
  updateRuleColor(id: number, color: string): void;
  scan(): void;
  updatePositions(): void;
  ensureOverlayContainer(): void;
  createOverlay(target: HTMLElement, color: string): HTMLElement;
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  onPointerUp(event: PointerEvent): void;
}

// 这里揉合了原本 panel.ts 的模版渲染逻辑
function renderDebuggerUI(appName: string) {
  const div = document.createElement("div");
  div.id = "monkey-debugger-root";
  div.innerHTML = debuggerHtml.replace("${appName}", appName);;
  document.body.appendChild(div);
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
      overlays: [],
      overlayContainer: null,
      observer: null,
      debounceTimer: null,

      init() {
        let id = 1;
        for (const [key, rule] of defaultRules.entries()) {
          if (typeof key === "string" && key === "GLOBAL_INIT") continue;
          const selectorString = rule.aSelector;
          this.rules.push({
            id: id++,
            name: rule.name,
            selector: selectorString,
            color: "#1976d2",
            active: true,
          });
        }
        window.addEventListener("pointerup", (e) => {
          if (this.dragging) this.onPointerUp(e);
        });
        window.addEventListener("pointermove", (e) => {
          if (this.dragging) this.onPointerMove(e);
        });
        this.setupObservers();
        this.scan();
      },

      setupObservers() {
        const updatePos = () => this.updatePositions();
        window.addEventListener("scroll", updatePos, {
          capture: true,
          passive: true,
        });
        window.addEventListener("resize", updatePos, { passive: true });
        const debouncedScan = () => {
          if (this.debounceTimer) window.clearTimeout(this.debounceTimer);
          this.debounceTimer = window.setTimeout(() => {
            this.scan();
          }, 200);
        };
        this.observer = new MutationObserver((mutations) => {
          if (
            this.overlayContainer &&
            mutations.every((m) => this.overlayContainer?.contains(m.target))
          )
            return;
          debouncedScan();
        });
        this.observer.observe(document.body, {
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
          selector: trimmed,
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
      updateRuleColor(id, color) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.color = color;
          this.scan();
        }
      },
      updateRuleName(id, name) {
        const r = this.rules.find((x) => x.id === id);
        if (r) r.name = name;
      },
      updateRuleSelector(id, selector) {
        const r = this.rules.find((x) => x.id === id);
        if (r) {
          r.selector = selector;
          this.scan();
        }
      },

      scan() {
        if (this.overlays.length > 0) {
          this.overlays.forEach((o) => o.box.remove());
          this.overlays = [];
        }
        this.rules
          .filter((r) => r.active)
          .forEach((r) => {
            const selectors = r.selector
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s);
            selectors.forEach((sel) => {
              try {
                const els = querySelectorAllDeep(sel);
                els.forEach((el) => {
                  if (el instanceof HTMLElement) {
                    const rect = el.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                      const box = this.createOverlay(el, r.color);
                      this.overlays.push({ target: el, box: box });
                    }
                  }
                });
              } catch (e) {
                console.warn(`[Debugger] Invalid selector: ${sel}`);
              }
            });
          });
      },

      updatePositions() {
        this.ensureOverlayContainer();
        this.overlays.forEach(({ target, box }) => {
          if (!target.isConnected) {
            box.style.display = "none";
            return;
          }
          const rect = target.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) {
            box.style.display = "none";
          } else {
            box.style.display = "block";
            box.style.left = `${rect.left}px`;
            box.style.top = `${rect.top}px`;
            box.style.width = `${rect.width}px`;
            box.style.height = `${rect.height}px`;
          }
        });
      },

      ensureOverlayContainer() {
        if (
          !this.overlayContainer ||
          !document.body.contains(this.overlayContainer)
        ) {
          this.overlayContainer = document.createElement("div");
          Object.assign(this.overlayContainer.style, {
            position: "fixed",
            left: "0",
            top: "0",
            width: "100%",
            height: "100%",
            pointerEvents: "none",
            zIndex: "100",
          });
          document.body.appendChild(this.overlayContainer);
        }
      },

      createOverlay(target: HTMLElement, color: string) {
        this.ensureOverlayContainer();
        const rect = target.getBoundingClientRect();
        const box = document.createElement("div");
        Object.assign(box.style, {
          position: "fixed",
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
          border: `2px solid ${color}`,
          backgroundColor: `${color}1a`,
          boxSizing: "border-box",
          pointerEvents: "none",
          transition: "none",
        });
        this.overlayContainer!.appendChild(box);
        return box;
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
        let newLeft = event.clientX - this.offsetX;
        let newTop = event.clientY - this.offsetY;
        this.left = Math.max(-300, Math.min(window.innerWidth - 40, newLeft));
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
    }),
  );

  renderDebuggerUI("monkeyApp");
}

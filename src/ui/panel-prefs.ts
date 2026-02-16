import Alpine from "alpinejs";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { setCustomMemoCss } from "../core/injection/injector";
import { UserListStore } from "./user-list-store";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";
const THEME_KEY = "isDark";
const TOGGLE_OPEN_TEXT_KEY = "btn_open_text";
const TOGGLE_CLOSE_TEXT_KEY = "btn_close_text";
const PERSIST_KEY_PREFIX = "panelPrefs:";

interface PersistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface PersistInterceptor<T> {
  as(key: string): PersistInterceptor<T>;
  using(storage: PersistStorage): T;
}

const gmPersistStorage: PersistStorage = {
  getItem(storageKey) {
    const value = GM_getValue<string>(`${PERSIST_KEY_PREFIX}${storageKey}`, "");
    return value || null;
  },
  setItem(storageKey, value) {
    GM_setValue(`${PERSIST_KEY_PREFIX}${storageKey}`, value);
  },
  removeItem(storageKey) {
    GM_setValue(`${PERSIST_KEY_PREFIX}${storageKey}`, "");
  },
};

function persistWithGmStorage<T>(key: string, initialValue: T): T {
  const persistFactory = (Alpine as unknown as {
    $persist?: (value: T) => PersistInterceptor<T>;
  }).$persist;

  if (!persistFactory) return initialValue;

  return persistFactory(initialValue).as(key).using(gmPersistStorage);
}

function applyCustomFontColor(color: string) {
  if (!color) {
    document.documentElement.style.removeProperty("--custom-font-color");
    return;
  }
  document.documentElement.style.setProperty("--custom-font-color", color);
}

function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("memo-container-dark-theme", dark);
}

function lintCss(css: string): string | null {
  const s = css.trim();
  if (!s) return null;
  let q: "'" | '"' | null = null;
  let esc = false;
  let c = 0;
  let br = 0;
  let pr = 0;
  let bk = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const nx = s[i + 1];
    if (c > 0) {
      if (ch === "*" && nx === "/") {
        c--;
        i++;
      }
      continue;
    }
    if (q) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === "/" && nx === "*") {
      c++;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      continue;
    }
    if (ch === "{") br++;
    else if (ch === "}") br--;
    else if (ch === "(") pr++;
    else if (ch === ")") pr--;
    else if (ch === "[") bk++;
    else if (ch === "]") bk--;
    if (br < 0) return "多余的 '}'";
    if (pr < 0) return "多余的 ')'";
    if (bk < 0) return "多余的 ']'";
  }
  if (c > 0) return "注释未闭合";
  if (q) return `字符串未闭合：${q}`;
  if (br > 0) return "缺少 '}'";
  if (pr > 0) return "缺少 ')'";
  if (bk > 0) return "缺少 ']'";
  return null;
}

function detectCssParsingIssue(
  css: string,
  ruleCount: number | undefined,
): string | null {
  if (!css.trim()) return null;
  if ((ruleCount || 0) !== 0) return null;
  const stripped = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
  if (/{/.test(stripped)) {
    return "浏览器未解析出任何规则，可能语法错误被忽略";
  }
  return null;
}

function resolveCssStatus(
  css: string,
  result: ReturnType<typeof setCustomMemoCss>,
): string {
  const lintResult = lintCss(css);
  if (lintResult) return `CSS 语法警告：${lintResult}`;
  if (!result.ok) return `CSS 语法错误：${result.error || "无法解析"}`;
  const parseWarn = detectCssParsingIssue(css, result.ruleCount);
  return parseWarn ? `CSS 解析警告：${parseWarn}` : "";
}

export interface PanelPrefsStore {
  initialized: boolean;
  openText: string;
  closeText: string;
  isDark: boolean;
  customFontColor: string;
  customMemoCss: string;
  cssStatus: string;
  showAdvancedCss: boolean;
  init(): void;
  toggleTheme(): void;
  editToggleText(isOpen: boolean): void;
  onCustomColorInput(): void;
  clearCustomColor(): void;
  closeAdvancedCss(): void;
  applyMemoCss(): void;
}

interface PanelPrefsDeps {
  getUserListStore: () => UserListStore;
}

export function createPanelPrefsStore({
  getUserListStore,
}: PanelPrefsDeps): PanelPrefsStore {
  const initialOpenText = GM_getValue<string>(TOGGLE_OPEN_TEXT_KEY, "UvU");
  const initialCloseText = GM_getValue<string>(TOGGLE_CLOSE_TEXT_KEY, "UwU");
  const initialDarkTheme = GM_getValue<boolean>(THEME_KEY, false);
  const initialFontColor = GM_getValue<string>(CUSTOM_FONT_COLOR_KEY, "").trim();
  const initialMemoCss = GM_getValue<string>(CUSTOM_MEMO_CSS_KEY, "");

  return {
    initialized: false,
    openText: persistWithGmStorage("toggle.openText", initialOpenText),
    closeText: persistWithGmStorage("toggle.closeText", initialCloseText),
    isDark: persistWithGmStorage("theme.isDark", initialDarkTheme),
    customFontColor: persistWithGmStorage("style.customFontColor", initialFontColor),
    customMemoCss: persistWithGmStorage("style.customMemoCss", initialMemoCss),
    cssStatus: "",
    showAdvancedCss: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      applyTheme(this.isDark);
      getUserListStore().isDark = this.isDark;
      const cssVarColor = document.documentElement.style
        .getPropertyValue("--custom-font-color")
        .trim();
      this.customFontColor = this.customFontColor || cssVarColor;
      applyCustomFontColor(this.customFontColor);
      this.applyMemoCss();
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      getUserListStore().isDark = this.isDark;
      applyTheme(this.isDark);
    },

    editToggleText(isOpen: boolean) {
      const currentText = isOpen ? this.openText : this.closeText;
      const nextText = prompt("修改文字:", currentText)?.trim();
      if (!nextText) return;
      if (isOpen) this.openText = nextText;
      else this.closeText = nextText;
    },

    onCustomColorInput() {
      applyCustomFontColor(this.customFontColor);
    },

    clearCustomColor() {
      this.customFontColor = "";
      applyCustomFontColor("");
      alert("已取消自定义字体颜色");
    },

    closeAdvancedCss() {
      this.showAdvancedCss = false;
    },

    applyMemoCss() {
      const nextCss = this.customMemoCss || "";
      const result = setCustomMemoCss(nextCss);
      this.cssStatus = resolveCssStatus(nextCss, result);
    },
  };
}

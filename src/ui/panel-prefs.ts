import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { setCustomMemoCss } from "../core/injection/injector";
import { UserListStore } from "./user-list-store";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";
const THEME_KEY = "isDark";
const TOGGLE_OPEN_TEXT_KEY = "btn_open_text";
const TOGGLE_CLOSE_TEXT_KEY = "btn_close_text";

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
  return {
    initialized: false,
    openText: GM_getValue<string>(TOGGLE_OPEN_TEXT_KEY, "UvU"),
    closeText: GM_getValue<string>(TOGGLE_CLOSE_TEXT_KEY, "UwU"),
    isDark: GM_getValue<boolean>(THEME_KEY, false),
    customFontColor: "",
    customMemoCss: "",
    cssStatus: "",
    showAdvancedCss: false,

    init() {
      if (this.initialized) return;
      this.initialized = true;

      applyTheme(this.isDark);
      getUserListStore().isDark = this.isDark;

      const storedColor = GM_getValue<string>(CUSTOM_FONT_COLOR_KEY, "").trim();
      const cssVarColor = document.documentElement.style
        .getPropertyValue("--custom-font-color")
        .trim();
      this.customFontColor = storedColor || cssVarColor;
      applyCustomFontColor(this.customFontColor);

      this.customMemoCss = GM_getValue<string>(CUSTOM_MEMO_CSS_KEY, "");
      this.applyMemoCss();
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      getUserListStore().isDark = this.isDark;
      GM_setValue(THEME_KEY, this.isDark);
      applyTheme(this.isDark);
    },

    editToggleText(isOpen: boolean) {
      const key = isOpen ? TOGGLE_OPEN_TEXT_KEY : TOGGLE_CLOSE_TEXT_KEY;
      const currentText = isOpen ? this.openText : this.closeText;
      const nextText = prompt("修改文字:", currentText)?.trim();
      if (!nextText) return;
      if (isOpen) this.openText = nextText;
      else this.closeText = nextText;
      GM_setValue(key, nextText);
    },

    onCustomColorInput() {
      applyCustomFontColor(this.customFontColor);
      GM_setValue(CUSTOM_FONT_COLOR_KEY, this.customFontColor);
    },

    clearCustomColor() {
      this.customFontColor = "";
      applyCustomFontColor("");
      GM_setValue(CUSTOM_FONT_COLOR_KEY, "");
      alert("已取消自定义字体颜色");
    },

    closeAdvancedCss() {
      this.showAdvancedCss = false;
    },

    applyMemoCss() {
      const nextCss = this.customMemoCss || "";
      const result = setCustomMemoCss(nextCss);
      this.cssStatus = resolveCssStatus(nextCss, result);
      GM_setValue(CUSTOM_MEMO_CSS_KEY, nextCss);
    },
  };
}

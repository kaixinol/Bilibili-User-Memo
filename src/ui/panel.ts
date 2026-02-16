import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { setCustomMemoCss } from "../core/injector";
import { registerUserStore, UserListStore } from "./user-list-store";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";

function applyCustomFontColor(color: string) {
  if (!color) return;
  document.documentElement.style.setProperty("--custom-font-color", color);
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

const themeManager = {
  isDark: GM_getValue<boolean>("isDark", false),

  init() {
    this.apply(this.isDark);
  },

  toggle() {
    this.isDark = !this.isDark;
    GM_setValue("isDark", this.isDark);
    this.apply(this.isDark);
  },

  apply(dark: boolean) {
    document
      .querySelector("html")
      ?.classList.toggle("memo-container-dark-theme", dark);
  },
};
/* =========================
 * 注入主面板
 * ========================= */
export function initMainPanel() {
  if (document.getElementById("bili-memo-container")) return;
  // 注册 store（必须在 Alpine.start 之前）
  registerUserStore();
  Alpine.data("themeHandler", () => ({
    isDark: themeManager.isDark,
    toggle() {
      themeManager.toggle();
      this.isDark = themeManager.isDark; // 同步组件内状态
    },
  }));

  // 3. 注册面板开关组件 (供 UwU 按钮使用)
  Alpine.data("toggleBtn", () => ({
    get isOpen() {
      return (Alpine.store("userList") as UserListStore).isOpen;
    },
    set isOpen(val) {
      (Alpine.store("userList") as UserListStore).isOpen = val;
    },

    openText: GM_getValue<string>("btn_open_text", "UvU"),
    closeText: GM_getValue<string>("btn_close_text", "UwU"),

    edit() {
      const isOp = this.isOpen;
      const key = isOp ? "btn_open_text" : "btn_close_text";
      const n = prompt("修改文字:", isOp ? this.openText : this.closeText);
      if (n?.trim()) {
        if (isOp) this.openText = n.trim();
        else this.closeText = n.trim();
        GM_setValue(key, n.trim());
      }
    },
  }));
  themeManager.init();
  // Alpine 组件只负责 UI 绑定
  Alpine.data("userList", () => Alpine.store("userList") as UserListStore);

  const finalHtml = panelHtml
    .replace("${appName}", "备注管理")
    .replace("${boxTemplate}", boxHtml);

  const container = document.createElement("div");
  container.id = "bili-memo-container";
  container.innerHTML = finalHtml;
  document.body.appendChild(container);

  const storedColor = GM_getValue<string>(CUSTOM_FONT_COLOR_KEY, "");
  const initialColor =
    storedColor ||
    document.documentElement.style.getPropertyValue("--custom-font-color");
  applyCustomFontColor(initialColor);

  const colorInput = container.querySelector(
    ".ghost-color-picker",
  ) as HTMLInputElement | null;
  if (colorInput) {
    colorInput.value = initialColor;
    colorInput.addEventListener("input", () => {
      const nextColor = colorInput.value;
      applyCustomFontColor(nextColor);
      GM_setValue(CUSTOM_FONT_COLOR_KEY, nextColor);
    });
  }

  const storedMemoCss = GM_getValue<string>(CUSTOM_MEMO_CSS_KEY, "");
  const memoCssStatus = container.querySelector(
    ".panel-custom-css-status",
  ) as HTMLDivElement | null;

  const setCssStatus = (message: string) => {
    if (!memoCssStatus) return;
    if (!message) {
      memoCssStatus.textContent = "";
      memoCssStatus.classList.remove("is-visible");
      return;
    }
    memoCssStatus.textContent = message;
    memoCssStatus.classList.add("is-visible");
  };

  const initialApply = setCustomMemoCss(storedMemoCss);
  const initialLint = lintCss(storedMemoCss);
  const initialParseWarn = detectCssParsingIssue(
    storedMemoCss,
    initialApply.ruleCount,
  );
  if (initialLint) {
    setCssStatus(`CSS 语法警告：${initialLint}`);
  } else if (!initialApply.ok) {
    setCssStatus(`CSS 语法错误：${initialApply.error || "无法解析"}`);
  } else if (initialParseWarn) {
    setCssStatus(`CSS 解析警告：${initialParseWarn}`);
  } else {
    setCssStatus("");
  }

  const memoCssInput = container.querySelector(
    ".panel-custom-css-input",
  ) as HTMLTextAreaElement | null;
  const colorSetting = container.querySelector(
    ".panel-custom-color-setting",
  ) as HTMLLabelElement | null;

  if (colorSetting) {
    colorSetting.addEventListener("click", () => {
      container.classList.remove("advanced-css-open");
    });
    colorSetting.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      container.classList.toggle("advanced-css-open");
      if (container.classList.contains("advanced-css-open")) {
        memoCssInput?.focus();
      }
    });
    const removeCustomColor = () => {
      document.documentElement.style.removeProperty("--custom-font-color");
      GM_setValue(CUSTOM_FONT_COLOR_KEY, "");
      alert("已取消自定义字体颜色");
    };
    // colorSetting.addEventListener("auxclick", (event) => {
    //   if (event.button === 1) removeCustomColor();
    // });
    // auxclick 在某些浏览器或环境中可能不兼容，改用 mousedown 监听中键点击
    colorSetting.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        removeCustomColor();
        e.preventDefault();
      }
    });
  }
  if (memoCssInput) {
    memoCssInput.value = storedMemoCss;
    let cssTimer: number | undefined;
    const applyNow = () => {
      const nextCss = memoCssInput.value || "";
      const result = setCustomMemoCss(nextCss);
      const lintResult = lintCss(nextCss);
      const parseWarn = detectCssParsingIssue(nextCss, result.ruleCount);
      if (lintResult) {
        setCssStatus(`CSS 语法警告：${lintResult}`);
      } else if (!result.ok) {
        setCssStatus(`CSS 语法错误：${result.error || "无法解析"}`);
      } else if (parseWarn) {
        setCssStatus(`CSS 解析警告：${parseWarn}`);
      } else {
        setCssStatus("");
      }
      GM_setValue(CUSTOM_MEMO_CSS_KEY, nextCss);
    };
    memoCssInput.addEventListener("input", () => {
      if (cssTimer) window.clearTimeout(cssTimer);
      cssTimer = window.setTimeout(applyNow, 1000);
    });
    memoCssInput.addEventListener("blur", applyNow);
  }
}

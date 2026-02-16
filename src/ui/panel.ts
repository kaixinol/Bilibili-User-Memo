import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { setCustomMemoCss } from "../core/injection/injector";
import { registerUserStore, UserListStore } from "./user-list-store";
import { BiliUser } from "../core/types";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";
const THEME_KEY = "isDark";
const TOGGLE_OPEN_TEXT_KEY = "btn_open_text";
const TOGGLE_CLOSE_TEXT_KEY = "btn_close_text";

let panelComponentsRegistered = false;

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

interface DisplayModeOption {
  value: number;
  label: string;
}

const DISPLAY_MODE_OPTIONS: DisplayModeOption[] = [
  { value: 0, label: "昵称" },
  { value: 1, label: "备注(昵称)" },
  { value: 2, label: "昵称(备注)" },
  { value: 3, label: "备注" },
];

interface PanelPrefsStore {
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

function useUserListStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

function usePanelPrefsStore(): PanelPrefsStore {
  return Alpine.store("panelPrefs") as PanelPrefsStore;
}

function createPanelPrefsStore(): PanelPrefsStore {
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
      useUserListStore().isDark = this.isDark;

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
      useUserListStore().isDark = this.isDark;
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

function registerPanelComponents() {
  if (panelComponentsRegistered) return;
  panelComponentsRegistered = true;

  Alpine.data("panelShell", () => ({
    init() {
      usePanelPrefsStore().init();
    },
    get isOpen(): boolean {
      return useUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      useUserListStore().isOpen = Boolean(next);
    },
    handleSelectAll(event: KeyboardEvent) {
      const userList = useUserListStore();
      if (!userList.isMultiSelect) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() !== "a") return;

      event.preventDefault();
      userList.invertSelection(userList.filteredUsers.map((user) => user.id));
    },
  }));

  Alpine.data("panelToggleBtn", () => ({
    get prefs(): PanelPrefsStore {
      return usePanelPrefsStore();
    },
    get isOpen(): boolean {
      return useUserListStore().isOpen;
    },
    set isOpen(next: boolean) {
      useUserListStore().isOpen = Boolean(next);
    },
    get openText(): string {
      return this.prefs.openText;
    },
    get closeText(): string {
      return this.prefs.closeText;
    },
    togglePanel() {
      this.isOpen = !this.isOpen;
    },
    editToggleText() {
      this.prefs.editToggleText(this.isOpen);
    },
  }));

  Alpine.data("panelSettings", () => ({
    displayModes: DISPLAY_MODE_OPTIONS,
    get userList(): UserListStore {
      return useUserListStore();
    },
    get prefs(): PanelPrefsStore {
      return usePanelPrefsStore();
    },
    get displayModeProxy(): number {
      return this.userList.displayMode;
    },
    set displayModeProxy(mode: number) {
      this.userList.setDisplayMode(Number(mode));
    },
    get isDark(): boolean {
      return this.prefs.isDark;
    },
    get customFontColor(): string {
      return this.prefs.customFontColor;
    },
    set customFontColor(next: string) {
      this.prefs.customFontColor = next;
    },
    get customMemoCss(): string {
      return this.prefs.customMemoCss;
    },
    set customMemoCss(next: string) {
      this.prefs.customMemoCss = next;
    },
    get cssStatus(): string {
      return this.prefs.cssStatus;
    },
    get showAdvancedCss(): boolean {
      return this.prefs.showAdvancedCss;
    },
    toggleTheme() {
      this.prefs.toggleTheme();
    },
    onCustomColorInput() {
      this.prefs.onCustomColorInput();
    },
    closeAdvancedCss() {
      this.prefs.closeAdvancedCss();
    },
    handleColorSettingContextMenu(event: MouseEvent) {
      event.preventDefault();
      this.prefs.showAdvancedCss = !this.prefs.showAdvancedCss;
      if (!this.prefs.showAdvancedCss) return;

      (this as any).$nextTick(() => {
        const input = (this as any).$refs.memoCssInput as
          | HTMLTextAreaElement
          | undefined;
        input?.focus();
      });
    },
    handleColorSettingMouseDown(event: MouseEvent) {
      if (event.button !== 1) return;
      event.preventDefault();
      this.prefs.clearCustomColor();
    },
    applyMemoCss() {
      this.prefs.applyMemoCss();
    },
  }));

  Alpine.data("panelActions", () => ({
    get userList(): UserListStore {
      return useUserListStore();
    },
    clearSearch() {
      this.userList.searchQuery = "";
    },
    confirmRemoveSelected() {
      const count = this.userList.selectedIds.length;
      if (count === 0) return;
      if (confirm(`确定要删除所选 ${count} 个用户吗？`)) {
        this.userList.removeSelected();
      }
    },
  }));

  Alpine.data("userCard", (userId: string) => ({
    userId,
    get userList(): UserListStore {
      return useUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.users.find((item) => item.id === this.userId);
    },
    get isSelected(): boolean {
      return this.userList.selectedIds.includes(this.userId);
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get selectedIds(): string[] {
      return this.userList.selectedIds;
    },
    set selectedIds(next: string[]) {
      this.userList.selectedIds = next;
    },
    confirmRemove() {
      if (confirm("确定要删除吗？")) {
        this.userList.removeUser(this.userId);
      }
    },
  }));

  Alpine.data("copyableUid", (uid: string) => ({
    uid,
    copied: false,
    init() {
      this.refreshOverflow();
    },
    refreshOverflow() {
      (this as any).$nextTick(() => {
        const el = (this as any).$el as HTMLElement;
        el.classList.toggle("can-expand", el.scrollWidth > el.clientWidth);
      });
    },
    copy() {
      navigator.clipboard.writeText(`UID:${this.uid}`);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
      }, 500);
    },
    get displayText(): string {
      return this.copied ? "✅ 已复制" : this.uid;
    },
  }));

  Alpine.data("memoEditor", (userId: string, initialMemo = "") => ({
    userId,
    isEditing: false,
    memoDraft: String(initialMemo ?? ""),
    get userList(): UserListStore {
      return useUserListStore();
    },
    get currentMemo(): string {
      return (
        this.userList.users.find((item) => item.id === this.userId)?.memo || ""
      );
    },
    syncDraft() {
      if (!this.isEditing) {
        this.memoDraft = this.currentMemo;
      }
    },
    startEdit() {
      this.isEditing = true;
      (this as any).$nextTick(() => {
        const input = (this as any).$refs.memoInput as
          | HTMLInputElement
          | undefined;
        input?.focus();
      });
    },
    commit() {
      this.isEditing = false;
      const nextMemo =
        typeof this.memoDraft === "string"
          ? this.memoDraft
          : String(this.memoDraft ?? "");
      this.userList.updateUser(this.userId, { memo: nextMemo });
    },
    cancel() {
      this.memoDraft = this.currentMemo;
      this.isEditing = false;
    },
    blurInput() {
      const input = (this as any).$refs.memoInput as
        | HTMLInputElement
        | undefined;
      input?.blur();
    },
  }));
}

/* =========================
 * 注入主面板
 * ========================= */
export function initMainPanel() {
  if (document.getElementById("bili-memo-container")) return;

  registerUserStore();
  if (!Alpine.store("panelPrefs")) {
    Alpine.store("panelPrefs", createPanelPrefsStore());
  }
  registerPanelComponents();

  const finalHtml = panelHtml
    .replace("${appName}", "备注管理")
    .replace("${boxTemplate}", boxHtml);

  const container = document.createElement("div");
  container.id = "bili-memo-container";
  container.innerHTML = finalHtml;
  document.body.appendChild(container);
}

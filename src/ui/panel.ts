import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { getUserInfo } from "../utils/sign";
import { logger } from "../utils/logger";
import { refreshPageInjection, setCustomMemoCss } from "../core/injector";
import { validateEitherJSON } from "../configs/schema";

const CUSTOM_FONT_COLOR_KEY = "customFontColor";
const CUSTOM_MEMO_CSS_KEY = "customMemoCss";

function applyCustomFontColor(color: string) {
  if (!color) return;
  document.documentElement.style.setProperty("--custom-font-color-base", color);
}

function getDefaultFontColor() {
  const computed = getComputedStyle(document.documentElement);
  return (
    computed.getPropertyValue("--custom-font-color-base").trim() ||
    computed.getPropertyValue("--primary-color").trim() ||
    "#fb7299"
  );
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

/* =========================
 * 类型定义
 * ========================= */
interface BiliUser {
  id: string;
  nickname: string;
  avatar: string;
  memo: string;
}

interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[]; // 变更为只读的计算属性
  isDark: boolean;
  isRefreshing: boolean;
  refreshCurrent: number;
  refreshTotal: number;
  displayMode: number;
  searchQuery: string;
  isMultiSelect: boolean;
  selectedIds: string[];
  updateUser(id: string, updates: Partial<BiliUser>): void;
  removeUser(id: string): void;
  toggleMultiSelect(): void;
  toggleSelected(id: string): void;
  isSelected(id: string): boolean;
  clearSelection(): void;
  invertSelection(ids: string[]): void;
  removeSelected(): void;
  setDisplayMode(mode: number): void;
  saveUsers(): void;
  exportData(): void;
  importData(): void;
  refreshData(): void;
}

/* =========================
 * Alpine Store
 * ========================= */
function registerUserStore() {
  if (Alpine.store("userList")) return;

  const loadAndDeduplicate = (): BiliUser[] => {
    const raw = GM_getValue<BiliUser[]>("biliUsers", []);
    if (!Array.isArray(raw)) return [];
    const userMap = new Map(raw.map((u) => [u.id, u]));
    return Array.from(userMap.values());
  };

  const initialUsers = loadAndDeduplicate();

  const store: UserListStore = {
    isOpen: __IS_DEBUG__ ? true : false,
    users: initialUsers,
    isDark: GM_getValue<boolean>("isDark", false),
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    displayMode: GM_getValue<number>("displayMode", 2),
    searchQuery: "",
    isMultiSelect: false,
    selectedIds: [],

    // 【核心修改】使用 Getter 自动计算过滤后的列表
    get filteredUsers() {
      const query = this.searchQuery.trim().toLowerCase();

      // 如果没有搜索词，直接返回所有用户
      if (!query) return this.users;

      // 执行搜索过滤
      return this.users.filter((user) => {
        // 提前处理字段，防止 null 报错
        const id = String(user.id || "");
        const nickname = (user.nickname || "").toLowerCase();
        const memo = (user.memo || "").toLowerCase();

        return (
          id.includes(query) || nickname.includes(query) || memo.includes(query)
        );
      });
    },
    updateUser(id: string, updates: Partial<BiliUser>) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        const before = this.users[index];
        const nextMemo =
          updates.memo !== undefined ? updates.memo.trim() : before.memo;
        const nextNickname =
          updates.nickname !== undefined ? updates.nickname : before.nickname;

        // 如果无实际变更，直接返回，避免多余刷新
        if (
          nextMemo === before.memo &&
          nextNickname === before.nickname &&
          (updates.id === undefined || updates.id === before.id)
        ) {
          return;
        }

        if (updates.memo !== undefined && nextMemo === "") {
          // 直接删除用户记录，不弹确认
          this.users.splice(index, 1);
          this.saveUsers();
          refreshPageInjection();
          return;
        }

        this.users[index] = {
          ...before,
          ...updates,
          memo: nextMemo,
          nickname: nextNickname,
        };
        this.saveUsers();
        // 如果昵称或备注发生变化，立即刷新页面注入
        if (
          updates.memo !== undefined ||
          updates.nickname !== undefined ||
          updates.id !== undefined
        ) {
          refreshPageInjection();
        }
      }
    },

    removeUser(id: string) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        this.users.splice(index, 1);
        this.saveUsers();
      }
    },
    toggleMultiSelect() {
      this.isMultiSelect = !this.isMultiSelect;
      if (!this.isMultiSelect) {
        this.clearSelection();
      }
    },
    toggleSelected(id: string) {
      if (this.selectedIds.includes(id)) {
        this.selectedIds = this.selectedIds.filter((item) => item !== id);
        return;
      }
      this.selectedIds = [...this.selectedIds, id];
    },
    isSelected(id: string) {
      return this.selectedIds.includes(id);
    },
    clearSelection() {
      this.selectedIds = [];
    },
    invertSelection(ids: string[]) {
      if (ids.length === 0) return;
      const current = new Set(this.selectedIds);
      const next = new Set(current);
      ids.forEach((id) => {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      });
      this.selectedIds = Array.from(next);
    },
    removeSelected() {
      if (this.selectedIds.length === 0) return;
      const targets = new Set(this.selectedIds);
      this.users = this.users.filter((user) => !targets.has(user.id));
      this.clearSelection();
      this.saveUsers();
    },

    setDisplayMode(mode: number) {
      this.displayMode = mode;
      GM_setValue("displayMode", mode);
      refreshPageInjection();
    },

    saveUsers() {
      GM_setValue("biliUsers", this.users);
    },

    async refreshData() {
      if (this.isRefreshing || this.users.length === 0) return;
      this.isRefreshing = true;
      this.refreshCurrent = 0;
      this.refreshTotal = this.users.length;

      const tasks = this.users.map(async (user) => {
        try {
          const newData = await getUserInfo(String(user.id));
          if (!newData.nickname) return;

          // 直接查找索引更新，不需要 map 和 splice 整个数组，保持引用稳定
          const target = this.users.find((u) => u.id === user.id);
          if (target) {
            target.nickname = newData.nickname;
            target.avatar = newData.avatar;
          }
        } catch (error) {
          logger.error(`刷新用户 [${user.id}] 失败:`, error);
        } finally {
          this.refreshCurrent++;
        }
      });

      await Promise.allSettled(tasks);
      this.saveUsers();
      // 不需要 searchUsers，UI 会自动更新
      setTimeout(() => {
        this.isRefreshing = false;
      }, 1000);
    },

    exportData() {
      const exportData = this.users.map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar || "",
        memo: user.memo || "",
      }));
      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bili-user-notes-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      alert(`导出成功！\n已导出 ${this.users.length} 个用户的数据`);
    },

    async importData() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          const fileContent = await file.text();
          const parsedData = JSON.parse(fileContent);

          const validation = validateEitherJSON(parsedData);
          if (!validation.ok) {
            alert(`导入失败：${validation.error}`);
            return;
          }

          let importedUsers: BiliUser[] = [];
          if (Array.isArray(parsedData)) {
            importedUsers = parsedData.map((user) => ({
              id: user.id || user.bid,
              nickname: user.nickname || "",
              avatar: user.avatar || "",
              memo: user.memo || "",
            }));
          } else if (typeof parsedData === "object") {
            importedUsers = Object.values(parsedData).map((user: any) => ({
              id: user.id || user.bid,
              nickname: user.nickname || "",
              avatar: user.avatar || "",
              memo: user.memo || "",
            }));
          } else {
            alert("导入失败：不支持的数据格式");
            return;
          }

          importedUsers = importedUsers.filter(
            (user) => user.id && user.nickname,
          );
          if (importedUsers.length === 0) {
            alert("导入失败：没有有效的用户数据");
            return;
          }

          const existingIds = new Set(this.users.map((u) => u.id));
          const newUsers = importedUsers.filter(
            (user) => !existingIds.has(user.id),
          );
          const updatedUsers = importedUsers.filter((user) =>
            existingIds.has(user.id),
          );

          updatedUsers.forEach((importedUser) => {
            const index = this.users.findIndex((u) => u.id === importedUser.id);
            if (index !== -1) {
              this.users.splice(index, 1, importedUser);
            }
          });

          if (newUsers.length > 0) {
            this.users.splice(this.users.length, 0, ...newUsers);
          }

          this.saveUsers();
          refreshPageInjection(); // 刷新页面其他部分的注入
          // 列表显示会自动更新，无需调用 searchUsers

          alert(
            `导入成功！\n新增：${newUsers.length} 个用户\n更新：${updatedUsers.length} 个用户`,
          );
        } catch (error) {
          console.error("Import error:", error);
          alert("导入失败：JSON 格式错误或数据解析失败");
        }
      };
      input.click();
    },
  };

  Alpine.store("userList", store);
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
  logger.debug("initMainPanel");
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
  const initialColor = storedColor || getDefaultFontColor();
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

  // 添加页面卸载时的自动保存
  window.addEventListener("beforeunload", () => {
    const store = Alpine.store("userList") as UserListStore;
    if (store && store.users && store.users.length > 0) {
      store.saveUsers();
    }
  });
}

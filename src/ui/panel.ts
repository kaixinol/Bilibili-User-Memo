import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { getUserInfo } from "../utils/sign";
import { logger } from "../utils/logger";
import { refreshPageInjection } from "../core/injector";
import { validateEitherJSON } from "../configs/schema";
import { parse } from "css-tree";
/* =========================
 * 类型定义
 * ========================= */
export interface BiliUser {
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
  addUser(user: BiliUser): void;
  updateUser(id: string, updates: Partial<BiliUser>): void;
  removeUser(id: string): void;
  saveUsers(): void;
  exportData(): void;
  importData(): void;
  refreshData(): void;
  formatDisplayName(user: BiliUser): string;
}

/* =========================
 * Alpine Store
 * ========================= */
export function registerUserStore() {
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

    addUser(user: BiliUser) {
      if (this.users.some((u) => u.id === user.id)) {
        logger.warn(`用户 [${user.id}] 已存在，跳过添加`);
        return;
      }
      logger.debug(`添加用户 [${user.id}]:`, user);
      this.users.push(user);
      this.saveUsers();
      // 不需要手动调用 searchUsers，getter 会自动响应
    },

    updateUser(id: string, updates: Partial<BiliUser>) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        this.users[index] = { ...this.users[index], ...updates };
        this.saveUsers();
      }
    },

    removeUser(id: string) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        this.users.splice(index, 1);
        this.saveUsers();
        refreshPageInjection();
      }
    },

    saveUsers() {
      GM_setValue("biliUsers", this.users);
    },

    formatDisplayName(user: BiliUser): string {
      switch (this.displayMode) {
        case 0:
          return user.nickname;
        case 1:
          return (
            user.memo + (user.memo ? "(" + user.nickname + ")" : user.nickname)
          );
        case 2:
          return user.nickname + (user.memo ? "(" + user.memo + ")" : "");
        case 3:
          return user.memo || user.nickname;
        default:
          return user.nickname;
      }
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

          if (!validateEitherJSON(fileContent)) {
            alert("导入失败：不支持的JSON格式");
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

  // 添加页面卸载时的自动保存
  window.addEventListener("beforeunload", () => {
    const store = Alpine.store("userList") as UserListStore;
    if (store && store.users && store.users.length > 0) {
      store.saveUsers();
    }
  });
}

/* =========================
 * 对外安全 API
 * ========================= */
export function appendUserCard(userData: BiliUser) {
  const store = Alpine.store("userList") as UserListStore | undefined;
  if (store) {
    store.addUser(userData);
  } else {
    console.warn("Alpine store 尚未就绪");
  }
}

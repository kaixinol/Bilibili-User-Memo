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
  filteredUsers: BiliUser[];
  isDark: boolean;
  isRefreshing: boolean;
  refreshCurrent: number;
  refreshTotal: number;
  displayMode: number; // 0:昵称 1:备注(昵称) 2:昵称(备注) 3:备注
  searchQuery: string;
  addUser(user: BiliUser): void;
  updateUser(id: string, updates: Partial<BiliUser>): void;
  removeUser(id: string): void;
  saveUsers(): void;
  exportData(): void;
  importData(): void;
  refreshData(): void;
  searchUsers(query: string): void;
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

    // 利用 Map 按 id 去重
    const userMap = new Map(raw.map((u) => [u.id, u]));
    return Array.from(userMap.values());
  };
  const initialUsers = loadAndDeduplicate();
  const store: UserListStore = {
    isOpen: __IS_DEBUG__ ? true : false,
    users: initialUsers,
    filteredUsers: [...initialUsers], // 这个会在registerUserStore函数结束时被填充
    isDark: GM_getValue<boolean>("isDark", false),
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    displayMode: GM_getValue<number>("displayMode", 2),
    searchQuery: "",
    addUser(user: BiliUser) {
      logger.debug(`添加用户 [${user.id}]:`, user);
      this.users.splice(this.users.length, 0, user);
      this.saveUsers();
      this.searchUsers("");
    },

    updateUser(id: string, updates: Partial<BiliUser>) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        this.users[index] = { ...this.users[index], ...updates };
        this.saveUsers();
        this.searchUsers("");
        refreshPageInjection(); // 刷新页面显示
      }
    },

    removeUser(id: string) {
      const index = this.users.findIndex((user) => user.id === id);
      if (index !== -1) {
        this.users.splice(index, 1);
        this.saveUsers();
        this.searchUsers("");
        refreshPageInjection(); // 刷新页面显示
      }
    },

    saveUsers() {
      GM_setValue("biliUsers", this.users);
    },

    searchUsers(query: string) {
      this.searchQuery = query;
      if (!query.trim()) {
        this.filteredUsers = [...this.users];
      } else {
        const lowerQuery = query.toLowerCase();
        this.filteredUsers = this.users.filter(
          (user) =>
            user.id.toLowerCase().includes(lowerQuery) ||
            user.nickname.toLowerCase().includes(lowerQuery) ||
            user.memo.toLowerCase().includes(lowerQuery),
        );
      }
    },

    formatDisplayName(user: BiliUser): string {
      switch (this.displayMode) {
        case 0: // 昵称
          return user.nickname;
        case 1: // 备注(昵称)
          return (
            user.memo + (user.memo ? "(" + user.nickname + ")" : user.nickname)
          );
        case 2: // 昵称(备注)
          return user.nickname + (user.memo ? "(" + user.memo + ")" : "");
        case 3: // 备注
          return user.memo || user.nickname;
        default:
          return user.nickname;
      }
    },

    async refreshData() {
      if (this.isRefreshing || this.users.length === 0) return;

      // 初始化进度
      this.isRefreshing = true;
      this.refreshCurrent = 0;
      this.refreshTotal = this.users.length;

      // 并发执行刷新任务
      const tasks = this.users.map(async (user) => {
        try {
          const newData = await getUserInfo(String(user.id));
          logger.info(`刷新用户 [${user.id}] 数据:`, newData);

          const index = this.users.findIndex((u) => u.id === user.id);
          if (index !== -1) {
            this.users.splice(index, 1, {
              ...user,
              nickname: newData.nickname,
              avatar: newData.avatar,
            });
          }
        } catch (error) {
          logger.error(`刷新用户 [${user.id}] 失败:`, error);
        } finally {
          // 无论成功失败，计数器增加
          this.refreshCurrent++;
        }
      });

      // 等待所有请求完成
      await Promise.allSettled(tasks);

      setTimeout(() => {
        this.isRefreshing = false;
      }, 1000);
    },
    exportData() {
      // 确保导出的数据格式一致
      const exportData = this.users.map((user) => ({
        id: user.id,
        nickname: user.nickname,
        avatar: user.avatar || "",
        memo: user.memo || "",
      }));

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bili-user-notes-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      // 显示成功提示
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

          // 验证JSON格式是否合法
          if (!validateEitherJSON(fileContent)) {
            alert("导入失败：不支持的JSON格式");
            return;
          }

          let importedUsers: BiliUser[] = [];

          // 处理数组格式（新格式）
          if (Array.isArray(parsedData)) {
            importedUsers = parsedData.map((user) => ({
              id: user.id || user.bid, // 兼容旧格式的bid字段
              nickname: user.nickname || "",
              avatar: user.avatar || "",
              memo: user.memo || "",
            }));
          }
          // 处理对象格式（旧格式）
          else if (typeof parsedData === "object") {
            importedUsers = Object.values(parsedData).map((user: any) => ({
              id: user.id || user.bid, // 兼容旧格式的bid字段
              nickname: user.nickname || "",
              avatar: user.avatar || "",
              memo: user.memo || "",
            }));
          } else {
            alert("导入失败：不支持的数据格式");
            return;
          }

          // 过滤掉无效数据
          importedUsers = importedUsers.filter(
            (user) => user.id && user.nickname,
          );

          if (importedUsers.length === 0) {
            alert("导入失败：没有有效的用户数据");
            return;
          }

          // 合并数据：新导入的数据覆盖已有数据
          const existingIds = new Set(this.users.map((u) => u.id));
          const newUsers = importedUsers.filter(
            (user) => !existingIds.has(user.id),
          );
          const updatedUsers = importedUsers.filter((user) =>
            existingIds.has(user.id),
          );

          // 更新现有用户 - 使用响应式方式
          updatedUsers.forEach((importedUser) => {
            const index = this.users.findIndex((u) => u.id === importedUser.id);
            if (index !== -1) {
              // 使用Alpine的响应式更新方式
              this.users.splice(index, 1, importedUser);
            }
          });

          // 添加新用户 - 使用响应式方式
          if (newUsers.length > 0) {
            this.users.splice(this.users.length, 0, ...newUsers);
          }

          // 保存到存储
          this.saveUsers();

          // 更新搜索结果
          this.searchUsers(this.searchQuery);

          // 刷新页面显示
          refreshPageInjection();

          const message = `导入成功！\n新增：${newUsers.length} 个用户\n更新：${updatedUsers.length} 个用户`;
          alert(message);
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
    document.querySelector("html")?.classList.toggle("marker-dark-theme", dark);
  },
};
/* =========================
 * 注入主面板
 * ========================= */
export function initMainPanel() {
  if (document.getElementById("bili-user-marker")) return;
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
  container.id = "bili-user-marker";
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

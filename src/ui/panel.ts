import Alpine from "alpinejs";
import panelHtml from "./panel.html?raw";
import boxHtml from "./box.html?raw";
import "../styles/panel.css";
import "../styles/global.css";
import "../styles/box.css";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { getUserInfo } from "../utils/sign";
import { logger } from "../utils/logger";
/* =========================
 * 类型定义
 * ========================= */
export interface BiliUser {
  id: string | number;
  nickname: string;
  avatar: string;
  note?: string;
}
interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  isDark: boolean;
  isRefreshing: boolean;
  refreshCurrent: number;
  refreshTotal: number;
  init(): void;
  addUser(user: BiliUser): void;
  toggleTheme(): void;
  applyTheme(dark: boolean): void;
  exportData(): void;
  importData(): void;
  refreshData(): void;
}

/* =========================
 * Alpine Store
 * ========================= */
export function registerUserStore() {
  if (Alpine.store("userList")) return;

  const store: UserListStore = {
    isOpen: __IS_DEBUG__ ? true : false,
    users: [],
    isDark: GM_getValue<boolean>("isDark", false),
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    init() {
      this.applyTheme(this.isDark);
    },

    addUser(user: BiliUser) {
      this.users.push(user);
    },

    toggleTheme() {
      this.isDark = !this.isDark;
      GM_setValue("isDark", this.isDark);
      this.applyTheme(this.isDark);
    },

    applyTheme(dark: boolean) {
      document
        .querySelector("html")
        ?.classList.toggle("marker-dark-theme", dark);
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

          Object.assign(user, {
            nickname: newData.nickname,
            avatar: newData.avatar,
          });
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
      const blob = new Blob([JSON.stringify(this.users, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "bili-user-notes.json";
      a.click();
      URL.revokeObjectURL(url);
    },

    importData() {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json";

      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;

        try {
          this.users = JSON.parse(await file.text());
        } catch {
          alert("导入失败：JSON 格式错误");
        }
      };

      input.click();
    },
  };

  Alpine.store("userList", store);
}

/* =========================
 * 注入主面板
 * ========================= */
export function initMainPanel() {
  if (document.getElementById("bili-user-marker")) return;

  // 注册 store（必须在 Alpine.start 之前）
  registerUserStore();

  // Alpine 组件只负责 UI 绑定
  Alpine.data("userList", () => Alpine.store("userList") as UserListStore);

  const finalHtml = panelHtml
    .replace("${appName}", "备注管理")
    .replace("${boxTemplate}", boxHtml);

  const container = document.createElement("div");
  container.id = "bili-user-marker";
  container.innerHTML = finalHtml;
  document.body.appendChild(container);
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

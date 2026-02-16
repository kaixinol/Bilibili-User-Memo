import Alpine from "alpinejs";
import { GM_getValue } from "vite-plugin-monkey/dist/client";
import { userStore } from "../core/store/store";
import { BiliUser } from "../core/types";
import {
  exportUsersAsJson,
  fetchLatestProfiles,
  readImportUsersFromDialog,
} from "./user-list-io";

export interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[];
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
  clearSelection(): void;
  invertSelection(ids: string[]): void;
  removeSelected(): void;
  setDisplayMode(mode: number): void;
  exportData(): void;
  importData(): void;
  refreshData(): void;
}

export function registerUserStore() {
  if (Alpine.store("userList")) return;

  const store: UserListStore = {
    isOpen: __IS_DEBUG__ ? true : false,
    users: userStore.getUsers(),
    isDark: GM_getValue<boolean>("isDark", false),
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    displayMode: userStore.displayMode,
    searchQuery: "",
    isMultiSelect: false,
    selectedIds: [],

    get filteredUsers() {
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) return this.users;

      return this.users.filter((user) => {
        const id = String(user.id || "");
        const nickname = (user.nickname || "").toLowerCase();
        const memo = (user.memo || "").toLowerCase();

        return (
          id.includes(query) || nickname.includes(query) || memo.includes(query)
        );
      });
    },

    updateUser(id: string, updates: Partial<BiliUser>) {
      const before = this.users.find((user) => user.id === id);
      if (!before) return;
      userStore.updateUser(id, updates, before.nickname || id);
    },

    removeUser(id: string) {
      userStore.removeUser(id);
    },

    toggleMultiSelect() {
      this.isMultiSelect = !this.isMultiSelect;
      if (!this.isMultiSelect) {
        this.clearSelection();
      }
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
      userStore.removeUsers(this.selectedIds);
      this.clearSelection();
    },

    setDisplayMode(mode: number) {
      userStore.setDisplayMode(mode);
    },

    async refreshData() {
      if (this.isRefreshing || this.users.length === 0) return;
      this.isRefreshing = true;
      this.refreshCurrent = 0;
      this.refreshTotal = this.users.length;

      const profiles = await fetchLatestProfiles(this.users, () => {
        this.refreshCurrent++;
      });
      userStore.updateUserProfiles(profiles);
      setTimeout(() => {
        this.isRefreshing = false;
      }, 1000);
    },

    exportData() {
      exportUsersAsJson(this.users);
      alert(`导出成功！\n已导出 ${this.users.length} 个用户的数据`);
    },

    async importData() {
      const readResult = await readImportUsersFromDialog();
      if (readResult.status === "cancelled") return;
      if (readResult.status === "error") {
        alert(readResult.message);
        return;
      }

      const result = userStore.upsertImportedUsers(readResult.users);
      if (result.added === 0 && result.updated === 0) {
        alert("导入完成，但没有可应用的变更");
        return;
      }
      alert(`导入成功！\n新增：${result.added} 个用户\n更新：${result.updated} 个用户`);
    },
  };

  // Alpine.store(...) 会返回响应式代理；后续必须写入代理对象，才能触发 UI 更新。
  Alpine.store("userList", store);
  const reactiveStore = Alpine.store("userList") as UserListStore;

  const syncUsers = (users: BiliUser[]) => {
    reactiveStore.users = users;
    if (reactiveStore.selectedIds.length === 0) return;
    const userIds = new Set(users.map((u) => u.id));
    reactiveStore.selectedIds = reactiveStore.selectedIds.filter((id) =>
      userIds.has(id),
    );
  };

  userStore.subscribe((change) => {
    if (change.type === "displayMode") {
      reactiveStore.displayMode = change.displayMode;
      return;
    }
    if (change.type === "users") {
      syncUsers(change.users);
      return;
    }
    syncUsers(change.users);
    reactiveStore.displayMode = change.displayMode;
  });
}

import Alpine from "alpinejs";
import { GM_getValue } from "vite-plugin-monkey/dist/client";
import { getUserInfo } from "../utils/sign";
import { logger } from "../utils/logger";
import { validateEitherJSON } from "../configs/schema";
import { userStore } from "../core/store";
import { BiliUser } from "../core/types";

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
  toggleSelected(id: string): void;
  isSelected(id: string): boolean;
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
      const profiles: Array<{ id: string; nickname: string; avatar: string }> =
        [];

      const tasks = this.users.map(async (user) => {
        try {
          const newData = await getUserInfo(String(user.id));
          if (!newData.nickname) return;
          profiles.push({
            id: user.id,
            nickname: newData.nickname,
            avatar: newData.avatar,
          });
        } catch (error) {
          logger.error(`刷新用户 [${user.id}] 失败:`, error);
        } finally {
          this.refreshCurrent++;
        }
      });

      await Promise.allSettled(tasks);
      userStore.updateUserProfiles(profiles);
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

          importedUsers = importedUsers.filter((user) => user.id && user.nickname);
          if (importedUsers.length === 0) {
            alert("导入失败：没有有效的用户数据");
            return;
          }

          const result = userStore.upsertImportedUsers(importedUsers);
          if (result.added === 0 && result.updated === 0) {
            alert("导入完成，但没有可应用的变更");
            return;
          }

          alert(
            `导入成功！\n新增：${result.added} 个用户\n更新：${result.updated} 个用户`,
          );
        } catch (error) {
          console.error("Import error:", error);
          alert("导入失败：JSON 格式错误或数据解析失败");
        }
      };
      input.click();
    },
  };

  const syncUsers = (users: BiliUser[]) => {
    store.users = users;
    if (store.selectedIds.length === 0) return;
    const userIds = new Set(users.map((u) => u.id));
    store.selectedIds = store.selectedIds.filter((id) => userIds.has(id));
  };

  userStore.subscribe((change) => {
    if (change.type === "displayMode") {
      store.displayMode = change.displayMode;
      return;
    }
    if (change.type === "users") {
      syncUsers(change.users);
      return;
    }
    syncUsers(change.users);
    store.displayMode = change.displayMode;
  });

  Alpine.store("userList", store);
}

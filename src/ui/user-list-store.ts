import Alpine from "alpinejs";
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { userStore } from "../core/store/store";
import { BiliUser } from "../core/types";
import {
  exportUsersAsJson,
  fetchLatestProfiles,
  readImportUsersFromDialog,
} from "./user-list-io";
import { getSearchForms, matchesChineseSearch } from "../utils/chinese-search";

export interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[];
  isDark: boolean;
  preloadAllCards: boolean;
  isUsersLoading: boolean;
  hasLoadedUsers: boolean;
  isRefreshing: boolean;
  refreshCurrent: number;
  refreshTotal: number;
  displayMode: number;
  searchQuery: string;
  isMultiSelect: boolean;
  selectedIds: string[];
  getUserById(id: string): BiliUser | undefined;
  updateUser(id: string, updates: Partial<BiliUser>): void;
  removeUser(id: string): void;
  toggleMultiSelect(): void;
  clearSelection(): void;
  invertSelection(ids: string[]): void;
  removeSelected(): void;
  setDisplayMode(mode: number): void;
  setOpen(next: boolean): void;
  setPreloadAllCards(next: boolean): void;
  ensureUsersLoaded(): Promise<void>;
  exportData(): void;
  importData(): void;
  refreshData(): void;
}

interface InternalUserListStore extends UserListStore {
  _usersMap: Map<string, BiliUser>;
  _usersList: BiliUser[];
  replaceUsersSnapshot(users: BiliUser[]): void;
  clearUsersSnapshot(): void;
}

const PRELOAD_ALL_CARDS_KEY = "panelPreloadAllCards";
const FUZZY_SEARCH_KEY = "panelFuzzySearch";

export function getPanelPreloadAllCards(): boolean {
  return GM_getValue<boolean>(PRELOAD_ALL_CARDS_KEY, true);
}

export function setPanelPreloadAllCards(value: boolean) {
  GM_setValue(PRELOAD_ALL_CARDS_KEY, value);
}

export function getPanelFuzzySearch(): boolean {
  return GM_getValue<boolean>(FUZZY_SEARCH_KEY, false);
}

export function setPanelFuzzySearch(value: boolean) {
  GM_setValue(FUZZY_SEARCH_KEY, value);
}

export function registerUserStore() {
  if (Alpine.store("userList")) return;
  const preloadAllCards = getPanelPreloadAllCards();
  const shouldPreloadImmediately = __IS_DEBUG__ || preloadAllCards;

  const store: InternalUserListStore = {
    isOpen: __IS_DEBUG__ ? true : false,
    // UI 层仅保留 core store 的快照索引，方便列表渲染和按 ID 读取。
    _usersMap: Alpine.reactive(new Map<string, BiliUser>()),
    _usersList: Alpine.reactive([] as BiliUser[]),

    get users() {
      return this._usersList;
    },
    getUserById(id: string) {
      return this._usersMap.get(id);
    },
    replaceUsersSnapshot(users: BiliUser[]) {
      this.clearUsersSnapshot();
      users.forEach((user) => {
        const reactiveUser = Alpine.reactive({ ...user });
        this._usersMap.set(reactiveUser.id, reactiveUser);
        this._usersList.push(reactiveUser);
      });
    },
    clearUsersSnapshot() {
      this._usersMap.clear();
      this._usersList.length = 0;
    },
    removeUser(userId: string) {
      userStore.removeUser(userId);
    },
    isDark: GM_getValue<boolean>("isDark", false),
    preloadAllCards,
    isUsersLoading: false,
    hasLoadedUsers: shouldPreloadImmediately,
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    displayMode: userStore.displayMode,
    searchQuery: "",
    isMultiSelect: false,
    selectedIds: [],

    get filteredUsers() {
      if (!this.searchQuery || !this.searchQuery.trim()) {
        return this._usersList;
      }

      const queryForms = getSearchForms(this.searchQuery);
      if (!queryForms.raw) return this._usersList;

      const enableFuzzy = getPanelFuzzySearch();
      return this._usersList.filter((user) => {
        return (
          String(user.id || "").includes(this.searchQuery) ||
          matchesChineseSearch(user.nickname, queryForms, enableFuzzy) ||
          matchesChineseSearch(user.memo, queryForms, enableFuzzy)
        );
      });
    },

    updateUser(id: string, updates: Partial<BiliUser>) {
      const before = this.getUserById(id);
      if (!before) return;
      userStore.updateUser(id, updates, before.nickname || id);
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

    setOpen(next: boolean) {
      const shouldOpen = Boolean(next);
      this.isOpen = shouldOpen;
      if (shouldOpen) {
        void this.ensureUsersLoaded();
      }
    },

    setPreloadAllCards(next: boolean) {
      const shouldPreload = Boolean(next);
      this.preloadAllCards = shouldPreload;
      setPanelPreloadAllCards(shouldPreload);

      if (shouldPreload) {
        if (this.hasLoadedUsers) return;
        this.replaceUsersSnapshot(userStore.getUsers());
        this.hasLoadedUsers = true;
        this.isUsersLoading = false;
        return;
      }

      if (this.isOpen) return;
      this.clearUsersSnapshot();
      this.hasLoadedUsers = false;
      this.isUsersLoading = false;
    },

    async ensureUsersLoaded() {
      if (this.hasLoadedUsers || this.isUsersLoading) return;
      this.isUsersLoading = true;

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve());
      });
      await new Promise<void>((resolve) => {
        const ric =
          (window as Window & {
            requestIdleCallback?: (
              callback: () => void,
              options?: { timeout: number },
            ) => number;
          }).requestIdleCallback;
        if (!ric) {
          window.setTimeout(resolve, 0);
          return;
        }
        ric(() => resolve(), { timeout: 300 });
      });

      const latestUsers = userStore.getUsers();
      this.replaceUsersSnapshot(latestUsers);
      this.hasLoadedUsers = true;
      this.isUsersLoading = false;
      if (this.selectedIds.length === 0) return;
      const userIds = new Set(latestUsers.map((u) => u.id));
      this.selectedIds = this.selectedIds.filter((id) => userIds.has(id));
    },

    async refreshData() {
      if (this.isRefreshing || this._usersList.length === 0) return;
      this.isRefreshing = true;
      this.refreshCurrent = 0;
      this.refreshTotal = this._usersList.length;

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
      alert(`导出成功！\n已导出 ${this._usersList.length} 个用户的数据`);
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
  const reactiveStore = Alpine.store("userList") as InternalUserListStore;

  if (shouldPreloadImmediately) {
    reactiveStore.replaceUsersSnapshot(userStore.getUsers());
  }

  const syncUsers = (users: BiliUser[]) => {
    if (!reactiveStore.hasLoadedUsers) return;
    reactiveStore.replaceUsersSnapshot(users);
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

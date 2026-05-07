import Alpine from "alpinejs";
import { userStore } from "@/core/store/store";
import type { BiliUser } from "@/core/types";
import {
  exportUsersAsJson,
  fetchLatestProfiles,
  readImportUsersFromDialog,
} from "./user-list-io";
import { getSearchForms, matchesChineseSearch } from "@/utils/chinese-search";
import { getGmValue, setGmValue } from "@/utils/gm-storage";
import { afterFramesAndIdle, delay } from "@/utils/scheduler";
import { showAlert } from "./dialogs";

export interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[];
  isDark: boolean;
  fuzzySearchEnabled: boolean;
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
  getRefreshTargets(): BiliUser[];
  setDisplayMode(mode: number): void;
  setFuzzySearchEnabled(next: boolean): void;
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
  syncUsersSnapshot(users: BiliUser[]): void;
  resetUsersSnapshot(): void;
}

const PRELOAD_ALL_CARDS_KEY = "panelPreloadAllCards";
const FUZZY_SEARCH_KEY = "panelFuzzySearch";

export function getPanelPreloadAllCards(): boolean {
  return getGmValue<boolean>(PRELOAD_ALL_CARDS_KEY, true);
}

export function setPanelPreloadAllCards(value: boolean) {
  setGmValue(PRELOAD_ALL_CARDS_KEY, value);
}

function getPanelFuzzySearch(): boolean {
  return getGmValue<boolean>(FUZZY_SEARCH_KEY, false);
}

function setPanelFuzzySearch(value: boolean) {
  setGmValue(FUZZY_SEARCH_KEY, value);
}

function syncUsersSnapshot(store: InternalUserListStore, users: BiliUser[]) {
  const nextIds = new Set(users.map((user) => user.id));

  for (const id of Array.from(store._usersMap.keys())) {
    if (!nextIds.has(id)) {
      store._usersMap.delete(id);
    }
  }

  const nextList: BiliUser[] = [];
  users.forEach((user) => {
    const existing = store._usersMap.get(user.id);
    if (existing) {
      existing.nickname = user.nickname;
      existing.avatar = user.avatar;
      existing.memo = user.memo;
      nextList.push(existing);
      return;
    }

    const reactiveUser = Alpine.reactive({ ...user });
    store._usersMap.set(reactiveUser.id, reactiveUser);
    nextList.push(reactiveUser);
  });

  store._usersList.splice(0, store._usersList.length, ...nextList);

  if (store.selectedIds.length === 0) return;
  store.selectedIds = store.selectedIds.filter((id) => nextIds.has(id));
}

async function waitForUsersSnapshotIdle() {
  await afterFramesAndIdle(5, 1000);
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
    syncUsersSnapshot(users: BiliUser[]) {
      syncUsersSnapshot(this, users);
    },
    resetUsersSnapshot() {
      this._usersMap.clear();
      this._usersList.length = 0;
    },
    removeUser(userId: string) {
      userStore.removeUser(userId);
    },
    isDark: getGmValue<boolean>("isDark", false),
    fuzzySearchEnabled: getPanelFuzzySearch(),
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
      const query = this.searchQuery.trim();
      if (!query) {
        return this._usersList;
      }

      const queryForms = getSearchForms(query);
      if (!queryForms.raw) return this._usersList;

      return this._usersList.filter((user) => {
        return (
          String(user.id || "").includes(query) ||
          matchesChineseSearch(
            user.nickname,
            queryForms,
            this.fuzzySearchEnabled,
          ) ||
          matchesChineseSearch(user.memo, queryForms, this.fuzzySearchEnabled)
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

    getRefreshTargets() {
      if (!this.isMultiSelect) return this._usersList;

      return this.selectedIds
        .map((id) => this._usersMap.get(id))
        .filter((user): user is BiliUser => Boolean(user));
    },

    setDisplayMode(mode: number) {
      userStore.setDisplayMode(mode);
    },
    setFuzzySearchEnabled(next: boolean) {
      const shouldEnable = Boolean(next);
      if (shouldEnable === this.fuzzySearchEnabled) return;
      this.fuzzySearchEnabled = shouldEnable;
      setPanelFuzzySearch(shouldEnable);
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
        this.syncUsersSnapshot(userStore.getUsers());
        this.hasLoadedUsers = true;
        this.isUsersLoading = false;
        return;
      }

      if (this.isOpen) return;
      this.resetUsersSnapshot();
      this.hasLoadedUsers = false;
      this.isUsersLoading = false;
    },

    async ensureUsersLoaded() {
      if (this.hasLoadedUsers || this.isUsersLoading) return;
      this.isUsersLoading = true;

      await waitForUsersSnapshotIdle();

      const latestUsers = userStore.getUsers();
      this.syncUsersSnapshot(latestUsers);
      this.hasLoadedUsers = true;
      this.isUsersLoading = false;
    },

    async refreshData() {
      const refreshTargets = this.getRefreshTargets();
      if (this.isRefreshing || refreshTargets.length === 0) return;
      this.isRefreshing = true;
      this.refreshCurrent = 0;
      this.refreshTotal = refreshTargets.length;

      try {
        const profiles = await fetchLatestProfiles(refreshTargets, () => {
          this.refreshCurrent++;
        });
        userStore.updateUserProfiles(profiles);
      } finally {
        await delay(1000);
        this.isRefreshing = false;
      }
    },

    exportData() {
      exportUsersAsJson(this.users);
      showAlert(`导出成功！\n已导出 ${this._usersList.length} 个用户的数据`);
    },

    async importData() {
      const readResult = await readImportUsersFromDialog();
      if (readResult.status === "cancelled") return;
      if (readResult.status === "error") {
        showAlert(readResult.message);
        return;
      }

      const result = userStore.upsertImportedUsers(readResult.users);
      if (result.added === 0 && result.updated === 0) {
        showAlert("导入完成，但没有可应用的变更");
        return;
      }
      showAlert(
        `导入成功！\n新增：${result.added} 个用户\n更新：${result.updated} 个用户`,
      );
    },
  };

  // Alpine.store(...) 会返回响应式代理；后续必须写入代理对象，才能触发 UI 更新。
  Alpine.store("userList", store);
  const reactiveStore = Alpine.store("userList") as InternalUserListStore;

  if (shouldPreloadImmediately) {
    reactiveStore.syncUsersSnapshot(userStore.getUsers());
  }

  const syncUsers = (users: BiliUser[]) => {
    if (!reactiveStore.hasLoadedUsers) return;
    reactiveStore.syncUsersSnapshot(users);
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

import Alpine from "alpinejs";
import { userStore } from "@/core/store/store";
import type { BiliUser } from "@/core/types";
import {
  exportUsersAsJson,
  fetchLatestProfiles,
  readImportUsersFromDialog,
} from "./user-list-io";
import {
  getSearchForms,
  matchesChineseSearch,
  type SearchForms,
} from "@/utils/chinese-search";
import {
  getGmValue,
  getPanelPreloadAllCards,
  persistWithGmStorage,
  setPanelPreloadAllCards,
} from "@/utils/gm-storage";
import { afterFramesAndIdle, delay } from "@/utils/scheduler";
import { showAlert } from "./dialogs";
import type {
  DeletedFilter,
  DetailMatch,
  UserListStore,
} from "./user-list-types";

export interface InternalUserListStore extends UserListStore {
  _usersMap: Map<string, BiliUser>;
  _usersList: BiliUser[];
  syncUsersSnapshot(users: readonly BiliUser[]): void;
  /** 当前筛选结果快照（带缓存，避免每个卡片重复过滤） */
  _filterState(): FilterState;
  getDetailMatch(userId: string): DetailMatch | null;
}

export interface FilterState {
  /** 通过筛选的用户（保持原始顺序） */
  list: BiliUser[];
  /** 通过筛选的用户 id，供卡片 O(1) 判断是否可见 */
  visible: Set<string>;
  /** 详细备注的命中片段，仅在有搜索词时计算 */
  detailMatches: Map<string, DetailMatch>;
}

function buildDetailMatch(
  detail: string | undefined,
  forms: SearchForms,
  enableFuzzySearch: boolean,
): DetailMatch | null {
  if (!detail || !detail.trim()) return null;
  if (!matchesChineseSearch(detail, forms, enableFuzzySearch)) return null;

  const lower = detail.toLowerCase();
  for (const variant of forms.variants) {
    const idx = lower.indexOf(variant);
    if (idx !== -1) {
      const start = Math.max(0, idx - 30);
      const end = Math.min(detail.length, idx + variant.length + 30);
      return {
        before: (start > 0 ? "…" : "") + detail.slice(start, idx),
        match: detail.slice(idx, idx + variant.length),
        after:
          detail.slice(idx + variant.length, end) +
          (end < detail.length ? "…" : ""),
        highlight: true,
      };
    }
  }

  // 模糊匹配无精确子串：仅展示开头片段，不高亮
  const snip = Math.min(detail.length, 60);
  return {
    before: detail.slice(0, snip) + (detail.length > snip ? "…" : ""),
    match: "",
    after: "",
    highlight: false,
  };
}

/**
 * 一次遍历同时算出：命中列表、命中 id 集合、详细备注高亮片段。
 * 搜索词为空时不做任何字符串匹配。
 */
function computeFilterState(
  users: readonly BiliUser[],
  query: string,
  enableFuzzySearch: boolean,
  deletedFilter: DeletedFilter,
): FilterState {
  const forms = query ? getSearchForms(query) : null;
  const searching = Boolean(forms?.raw);

  const list: BiliUser[] = [];
  const visible = new Set<string>();
  const detailMatches = new Map<string, DetailMatch>();

  for (const user of users) {
    if (searching && forms) {
      const hit =
        String(user.id || "").includes(query) ||
        matchesChineseSearch(user.nickname, forms, enableFuzzySearch) ||
        matchesChineseSearch(user.memo, forms, enableFuzzySearch) ||
        matchesChineseSearch(user.memoDetail, forms, enableFuzzySearch);
      if (!hit) continue;
    }

    if (deletedFilter === "deleted" && !user.isDeleted) continue;
    if (deletedFilter === "active" && user.isDeleted) continue;

    list.push(user);
    visible.add(user.id);

    if (searching && forms) {
      const match = buildDetailMatch(
        user.memoDetail,
        forms,
        enableFuzzySearch,
      );
      if (match) detailMatches.set(user.id, match);
    }
  }

  return { list, visible, detailMatches };
}

function syncUsersSnapshot(store: InternalUserListStore, users: readonly BiliUser[]) {
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
      existing.memoDetail = user.memoDetail;
      existing.isDeleted = user.isDeleted;
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

function resetDeletedFilterIfNoDeleted(store: InternalUserListStore) {
  if (store.deletedFilter !== "all" && !store._usersList.some((u) => u.isDeleted)) {
    store.deletedFilter = "all";
  }
}

async function waitForIdleFrames() {
  await afterFramesAndIdle(5, 1000);
}

export function createUserListStore(): InternalUserListStore {
  const preloadAllCards = persistWithGmStorage("panelPreloadAllCards", true);
  const preloadAllCardsEnabled = getPanelPreloadAllCards();

  const rawAutoOpen = getGmValue<boolean>("debug.autoOpenPanel", false);

  // 筛选结果缓存：用户数据每次同步都会 bump usersVersion，
  // 因此 (usersVersion, query, fuzzy, deletedFilter) 足以作为缓存键。
  let usersVersion = 0;
  let filterCacheKey = "";
  let filterCache: FilterState | null = null;

  return {
    isOpen: rawAutoOpen,
    _usersMap: Alpine.reactive(new Map<string, BiliUser>()),
    _usersList: Alpine.reactive([] as BiliUser[]),

    get users() {
      return this._usersList;
    },
    getUserById(id: string) {
      return this._usersMap.get(id);
    },
  syncUsersSnapshot(users: readonly BiliUser[]) {
    usersVersion++;
    syncUsersSnapshot(this, users);
    resetDeletedFilterIfNoDeleted(this);
  },
    removeUser(userId: string) {
      userStore.removeUser(userId);
    },
    isDark: persistWithGmStorage<boolean>("isDark", false),
    fuzzySearchEnabled: persistWithGmStorage("panelFuzzySearch", false),
    silentAvatarUpdate: persistWithGmStorage("panelSilentAvatarUpdate", false),
    preloadAllCards,
    isUsersLoading: false,
    hasLoadedUsers: preloadAllCardsEnabled,
    isRefreshing: false,
    refreshCurrent: 0,
    refreshTotal: 0,
    displayMode: userStore.displayMode,
    searchQuery: "",
    isMultiSelect: false,
    selectedIds: [],
    deletedFilter: "all" as DeletedFilter,

    get hasDeletedUsers() {
      return this._usersList.some((user) => user.isDeleted);
    },

    _filterState(): FilterState {
      // 注意：这里必须读取全部输入，Alpine 才能正确收集依赖
      const query = this.searchQuery.trim();
      const fuzzy = Boolean(this.fuzzySearchEnabled);
      const deletedFilter = this.deletedFilter;
      const key = `${usersVersion}|${query}|${fuzzy ? 1 : 0}|${deletedFilter}`;

      if (filterCache && filterCacheKey === key) return filterCache;

      const next = computeFilterState(
        this._usersList,
        query,
        fuzzy,
        deletedFilter,
      );
      filterCacheKey = key;
      filterCache = next;
      return next;
    },

    get filteredUsers() {
      return this._filterState().list;
    },

    isUserVisible(userId: string): boolean {
      return this._filterState().visible.has(userId);
    },

    getDetailMatch(userId: string): DetailMatch | null {
      return this._filterState().detailMatches.get(userId) ?? null;
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
    },
    setDeletedFilter(next: DeletedFilter) {
      this.deletedFilter =
        next === "deleted" || next === "active" ? next : "all";
    },
    setSilentAvatarUpdate(next: boolean) {
      const shouldEnable = Boolean(next);
      if (shouldEnable === this.silentAvatarUpdate) return;
      this.silentAvatarUpdate = shouldEnable;
    },

    setOpen(next: boolean) {
      const shouldOpen = Boolean(next);
      this.isOpen = shouldOpen;
      if (shouldOpen) {
        this.deletedFilter = "all";
        void this.ensureUsersLoaded();
      }
    },

    setPreloadAllCards(next: boolean) {
      const shouldPreload = Boolean(next);
      if (this.preloadAllCards === shouldPreload) return;

      this.preloadAllCards = shouldPreload;
      setPanelPreloadAllCards(shouldPreload);

      if (shouldPreload) {
        if (this.hasLoadedUsers) return;
        this.syncUsersSnapshot(userStore.getUsers());
        this.hasLoadedUsers = true;
        this.isUsersLoading = false;
      }
    },

    async ensureUsersLoaded() {
      if (this.hasLoadedUsers || this.isUsersLoading) return;
      this.isUsersLoading = true;

      await waitForIdleFrames();

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
}

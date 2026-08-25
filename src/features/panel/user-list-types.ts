import type { BiliUser } from "@/core/types";

export interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[];
  getDetailMatch(userId: string): {
    before: string;
    match: string;
    after: string;
    highlight: boolean;
  } | null;
  isDark: boolean;
  fuzzySearchEnabled: boolean;
  silentAvatarUpdate: boolean;
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
  setSilentAvatarUpdate(next: boolean): void;
  setOpen(next: boolean): void;
  setPreloadAllCards(next: boolean): void;
  ensureUsersLoaded(): Promise<void>;
  exportData(): void;
  importData(): void;
  refreshData(): void;
}

import Alpine from "alpinejs";
import { userStore } from "@/core/store/store";
import type { BiliUser } from "@/core/types";
import { getGmValue, setGmValue } from "@/utils/gm-storage";
import { createUserListStore, type InternalUserListStore } from "./user-list-factory";

export interface UserListStore {
  isOpen: boolean;
  users: BiliUser[];
  readonly filteredUsers: BiliUser[];
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

const PRELOAD_ALL_CARDS_KEY = "panelPreloadAllCards";
const SILENT_AVATAR_UPDATE_KEY = "panelSilentAvatarUpdate";

export function getPanelPreloadAllCards(): boolean {
  return getGmValue<boolean>(PRELOAD_ALL_CARDS_KEY, true);
}

export function setPanelPreloadAllCards(value: boolean) {
  setGmValue(PRELOAD_ALL_CARDS_KEY, value);
}

export function getSilentAvatarUpdate(): boolean {
  return getGmValue<boolean>(SILENT_AVATAR_UPDATE_KEY, false);
}

export function setSilentAvatarUpdate(value: boolean) {
  setGmValue(SILENT_AVATAR_UPDATE_KEY, value);
}

export function registerUserStore() {
  if (Alpine.store("userList")) return;

  const store = createUserListStore();
  Alpine.store("userList", store);
  const reactiveStore = Alpine.store("userList") as InternalUserListStore;

  if (reactiveStore.hasLoadedUsers) {
    reactiveStore.syncUsersSnapshot(userStore.getUsers());
  }

  userStore.subscribe((change) => {
    if (change.type === "displayMode") {
      reactiveStore.displayMode = change.displayMode;
      return;
    }
    if (change.type === "users") {
      if (reactiveStore.hasLoadedUsers) {
        reactiveStore.syncUsersSnapshot(change.users);
      }
      return;
    }
    if (reactiveStore.hasLoadedUsers) {
      reactiveStore.syncUsersSnapshot(change.users);
    }
    reactiveStore.displayMode = change.displayMode;
  });
}

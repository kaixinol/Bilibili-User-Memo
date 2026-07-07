import Alpine from "alpinejs";
import type { UserListStore } from "@/features/panel/user-list-store";
import type { BiliUser } from "@/core/types";
import { isNoFaceAvatar } from "@/core/dom/avatar-utils";
import { logger } from "@/utils/logger";

type CheckFn = (store: UserListStore) => unknown;

interface CheckResult {
  name: string;
  passed: boolean;
  value: unknown;
  error?: string;
}

export interface TestApi {
  store(): UserListStore;
  getUsers(): BiliUser[];
  getFilteredUsers(): BiliUser[];
  setSearch(query: string): void;
  clearSearch(): void;
  selectAll(): void;
  clearSelection(): void;
  getSelectionState(): {
    isMultiSelect: boolean;
    selectedIds: string[];
    filteredCount: number;
  };
  exportJson(): string;
  refreshAndWait(): Promise<{
    success: boolean;
    progress: string;
    userCount: number;
  }>;
  runChecks(checks: Record<string, CheckFn>): CheckResult[];
}

function getStore(): UserListStore {
  return Alpine.store("userList") as UserListStore;
}

function buildExportData(users: BiliUser[]): Record<string, unknown>[] {
  return users.map((user) => {
    const data: Record<string, unknown> = {
      id: user.id,
      nickname: user.nickname,
      memo: user.memo || "",
    };
    if (user.avatar && !isNoFaceAvatar(user.avatar)) {
      data.avatar = user.avatar;
    }
    if (user.isDeleted === true) {
      data.isDeleted = true;
    }
    return data;
  });
}

export function initTestApi() {
  if (!__IS_DEBUG__) return;

  const api: TestApi = {
    store: getStore,

    getUsers() {
      return getStore().users;
    },

    getFilteredUsers() {
      return getStore().filteredUsers;
    },

    setSearch(query: string) {
      getStore().searchQuery = query;
    },

    clearSearch() {
      getStore().searchQuery = "";
    },

    selectAll() {
      const store = getStore();
      store.invertSelection(store.filteredUsers.map((u) => u.id));
    },

    clearSelection() {
      getStore().clearSelection();
    },

    getSelectionState() {
      const store = getStore();
      return {
        isMultiSelect: store.isMultiSelect,
        selectedIds: [...store.selectedIds],
        filteredCount: store.filteredUsers.length,
      };
    },

    exportJson() {
      const data = buildExportData(getStore().users);
      return JSON.stringify(data, null, 2);
    },

    async refreshAndWait() {
      const store = getStore();
      store.refreshData();

      return new Promise<{ success: boolean; progress: string; userCount: number }>((resolve) => {
        const check = () => {
          if (!store.isRefreshing) {
            resolve({
              success: true,
              progress: `${store.refreshCurrent}/${store.refreshTotal}`,
              userCount: store.users.length,
            });
          } else {
            setTimeout(check, 200);
          }
        };
        setTimeout(check, 100);
      });
    },

    runChecks(checks: Record<string, CheckFn>) {
      const store = getStore();
      const results: CheckResult[] = [];

      for (const [name, fn] of Object.entries(checks)) {
        try {
          const value = fn(store);
          results.push({ name, passed: true, value });
        } catch (error) {
          results.push({
            name,
            passed: false,
            value: null,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return results;
    },
  };

  window.__biliMemoTest = api;
  logger.info("[TestAPI] window.__biliMemoTest ready");
}

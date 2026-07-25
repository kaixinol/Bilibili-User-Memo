import Alpine from "alpinejs";
import { userStore } from "@/core/store/store";
import { createUserListStore, type InternalUserListStore } from "./user-list-factory";

export type { UserListStore } from "./user-list-types";

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

import Alpine from "alpinejs";
import { getUserInfo } from "@/utils/sign";
import { DEFAULT_AVATAR_URL } from "@/core/dom/dom-utils";
import { userStore } from "@/core/store/store";
import type { BiliUser } from "@/core/types";
import { showAlert } from "./dialogs";

type AddUserDialogStore = {
  isOpen: boolean;
  uid: string;
  memo: string;
  avatar: string;
  isLoading: boolean;
  open(): void;
  close(): void;
  submit(): Promise<void>;
  resetForm(): void;
};

export function registerAddUserDialog() {
  Alpine.store("addUserDialog", {
    isOpen: false,
    uid: "",
    memo: "",
    avatar: "",
    isLoading: false,

    open(this: AddUserDialogStore) {
      this.resetForm();
      this.isOpen = true;
      setTimeout(() => {
        const input = document.querySelector<HTMLInputElement>("#add-user-uid");
        input?.focus();
      }, 50);
    },

    close(this: AddUserDialogStore) {
      this.isOpen = false;
    },

    async submit(this: AddUserDialogStore) {
      const uid = this.uid.trim();
      const memo = this.memo.trim();
      if (!uid || !memo) {
        return;
      }

      const existing = userStore.getUsers().find((u) => u.id === uid);
      if (existing) {
        showAlert(`用户 UID:${uid} 已存在`);
        return;
      }

      this.isLoading = true;

      try {
        const userInfo = await getUserInfo(uid);
        if (!userInfo || !userInfo.nickname) {
          showAlert(`无法获取 UID:${uid} 的用户信息`);
          return;
        }

        const newUser: BiliUser = {
          id: uid,
          nickname: userInfo.nickname,
          avatar: this.avatar.trim() || (userInfo.avatar ?? DEFAULT_AVATAR_URL),
          memo,
          isDeleted: userInfo.isDeleted,
        };

        userStore.upsertImportedUsers([newUser]);
        this.close();
        showAlert(`成功添加用户: ${userInfo.nickname}`);
      } catch (error) {
        showAlert(`添加用户失败: ${error}`);
      } finally {
        this.isLoading = false;
      }
    },

    resetForm(this: AddUserDialogStore) {
      this.uid = "";
      this.memo = "";
      this.avatar = "";
      this.isLoading = false;
    },
  });
}

import Alpine from "alpinejs";
import type { BiliUser } from "@/core/types";
import type { UserListStore } from "./user-list-store";
import { confirmDialog, promptText, showAlert } from "./dialogs";
import { biliFixAPIReady } from "@/core/api/bili-api";
import { isNoFaceAvatar } from "@/core/dom/avatar-utils";
import { AVATAR_URL_INVALID_MESSAGE, isValidAvatarUrl } from "./avatar-url";
import { isFakeNoFaceAvatarFromImg } from "./perceptual-hash";
import { logger } from "@/utils/logger";
import {
  getUserListStore,
  runOnNextTick,
  getRef,
  getCurrentElement,
} from "./panel-core";
import { validateInputLength } from "@/core/dom/text-utils";

const processedUID = new WeakSet<Element>();

type MemoDetailDialogStore = {
  isOpen: boolean;
  uid: string;
  detail: string;
  open(uid: string): void;
  close(): void;
  handleInput(input: HTMLTextAreaElement): void;
  submit(input?: HTMLTextAreaElement | null): void;
};

export function registerMemoDetailDialog() {
  if (Alpine.store("memoDetailDialog")) return;

  Alpine.store("memoDetailDialog", {
    isOpen: false,
    uid: "",
    detail: "",

    open(this: MemoDetailDialogStore, uid: string) {
      const user = getUserListStore().getUserById(uid);
      this.uid = uid;
      this.detail = user?.memoDetail || "";
      this.isOpen = true;
    },

    close(this: MemoDetailDialogStore) {
      this.isOpen = false;
    },

    submit(this: MemoDetailDialogStore, input?: HTMLTextAreaElement | null) {
      const uid = this.uid;
      if (!uid) return;
      if (input && (input.validity.tooShort || input.validity.tooLong)) return;
      const detail = this.detail.trim();
      getUserListStore().updateUser(uid, { memoDetail: detail || undefined });
      this.close();
    },
    handleInput(this: MemoDetailDialogStore, input: HTMLTextAreaElement) {
      validateInputLength(input);
    },
  });
}

export function registerUserCard() {
  Alpine.data("userCard", (userId: string) => ({
    userId,
    get userList(): UserListStore {
      return getUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.getUserById(this.userId);
    },
    get isSelected(): boolean {
      return this.userList.selectedIds.includes(this.userId);
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get selectedIds(): string[] {
      return this.userList.selectedIds;
    },
    set selectedIds(next: string[]) {
      this.userList.selectedIds = next;
    },
    toggleSelected() {
      const next = new Set(this.userList.selectedIds);
      if (next.has(this.userId)) next.delete(this.userId);
      else next.add(this.userId);
      this.userList.selectedIds = Array.from(next);
    },
    handleCardClick(event: MouseEvent) {
      if (!this.isMultiSelect) return;

      const target = event.target as HTMLElement | null;
      if (!target || target.closest(".user-select")) return;

      event.preventDefault();
      this.toggleSelected();
    },
    confirmRemove() {
      if (confirmDialog("确定要删除吗？")) {
        this.userList.removeUser(this.userId);
      }
    },
  }));
}

export function registerCopyableUid() {
  Alpine.data("copyableUid", (uid: string) => ({
    uid,
    copied: false,
    canExpand: false,
    get isMultiSelect(): boolean {
      return getUserListStore().isMultiSelect;
    },
    init() {
      this.refreshOverflow();
    },
    refreshOverflow() {
      runOnNextTick(this, () => {
        const element = getCurrentElement(this);
        if (!element) return;
        this.canExpand = element.scrollWidth > element.clientWidth;
      });
    },
    handleMouseEnter() {
      this.refreshOverflow();
    },
    handleMouseLeave() {
      this.canExpand = false;
    },
    copy() {
      if (this.isMultiSelect) return;
      void navigator.clipboard.writeText(`UID:${this.uid}`);
      this.copied = true;
      window.setTimeout(() => {
        this.copied = false;
      }, 500);
      this.refreshOverflow();
    },
    get displayText(): string {
      return this.copied ? "✅ 已复制" : this.uid;
    },
  }));
}

export function registerAvatarEditor() {
  Alpine.data("avatarEditor", (userId: string) => ({
    userId,
    fakeNoFace: false,
    checked: false,
    get userList(): UserListStore {
      return getUserListStore();
    },
    get currentUser(): BiliUser | undefined {
      return this.userList.getUserById(this.userId);
    },
    get currentAvatar(): string {
      return this.currentUser?.avatar || "";
    },
    get canEditAvatar(): boolean {
      return isNoFaceAvatar(this.currentAvatar);
    },
    get avatarTitle(): string {
      if (this.fakeNoFace) return "\u26a0\ufe0f该头像疑似为用户自己上传的默认头像";
      if (this.canEditAvatar) return "右键修改头像";
      return `${this.currentUser?.nickname || this.userId}（中键修改头像）`;
    },
    checkFakeNoFace() {
      if (this.checked || isNoFaceAvatar(this.currentAvatar)) return;
      const wrapper = getCurrentElement(this);
      const img = wrapper?.querySelector<HTMLImageElement>("img.user-avatar");
      if (!img) {
        logger.debug("[avatarEditor] 未找到头像img元素");
        return;
      }
      this.fakeNoFace = isFakeNoFaceAvatarFromImg(img);
      this.checked = true;
    },
    handleMiddleClick(event: MouseEvent) {
      if (event.button !== 1) return;
      if (this.userList.isMultiSelect) return;
      if (isNoFaceAvatar(this.currentAvatar)) return;

      event.preventDefault();

      if (this.userList.silentAvatarUpdate) {
        const disableSilent = confirmDialog(
          "是否同时关闭静默更新头像功能？\n关闭后访问空间页将不再自动更新此用户头像。",
        );
        if (disableSilent) {
          this.userList.setSilentAvatarUpdate(false);
        }
      }

      const nextAvatar = promptText("请输入头像 URL");
      if (!nextAvatar) return;

      if (!isValidAvatarUrl(nextAvatar)) {
        showAlert(AVATAR_URL_INVALID_MESSAGE);
        return;
      }

      this.userList.updateUser(this.userId, { avatar: nextAvatar });
    },
    editAvatar(event: MouseEvent) {
      if (this.userList.isMultiSelect || !this.canEditAvatar) {
        return;
      }
      event.preventDefault();

      const nextAvatar = promptText("请输入头像 URL");
      if (!nextAvatar) return;

      if (!isValidAvatarUrl(nextAvatar)) {
        showAlert(AVATAR_URL_INVALID_MESSAGE);
        return;
      }

      this.userList.updateUser(this.userId, { avatar: nextAvatar });
    },
  }));
}

export function registerMemoEditor() {
  Alpine.data("memoEditor", (userId: string, initialMemo = "") => ({
    userId,
    isEditing: false,
    memoDraft: String(initialMemo ?? ""),
    get userList(): UserListStore {
      return getUserListStore();
    },
    get isMultiSelect(): boolean {
      return this.userList.isMultiSelect;
    },
    get currentMemo(): string {
      return this.userList.getUserById(this.userId)?.memo || "";
    },
    syncDraft() {
      if (!this.isEditing) {
        this.memoDraft = this.currentMemo;
      }
    },
    startEdit() {
      if (this.isMultiSelect) return;
      this.isEditing = true;
      runOnNextTick(this, () => {
        getRef<HTMLInputElement>(this, "memoInput")?.focus();
      });
    },
    commit() {
      this.isEditing = false;
      const nextMemo = typeof this.memoDraft === "string"
        ? this.memoDraft
        : String(this.memoDraft ?? "");
      this.userList.updateUser(this.userId, { memo: nextMemo });
    },
    cancel() {
      this.memoDraft = this.currentMemo;
      this.isEditing = false;
    },
    blurInput() {
      getRef<HTMLInputElement>(this, "memoInput")?.blur();
    },
    handleInput(input: HTMLInputElement) {
      validateInputLength(input);
    },
  }));
}

export function registerUidFixLink() {
  Alpine.data("uidFixLink", (uid: string) => ({
    uid,
    get isDeleted(): boolean | undefined {
      return getUserListStore().getUserById(this.uid)?.isDeleted;
    },
    async init() {
      const el = this.$el;
      if (processedUID.has(el)) return;
      processedUID.add(el);

      const api = await biliFixAPIReady();
      if (!api || !this.isDeleted) return;
      api.annotateElements([el]);
    },
  }));
}

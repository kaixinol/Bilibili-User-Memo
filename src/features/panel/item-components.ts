import Alpine from "alpinejs";
import type { BiliUser } from "@/core/types";
import type { DetailMatch } from "./user-list-store";
import { confirmDialog, promptText, showAlert } from "./dialogs";
import { biliFixAPIReady } from "@/core/api/bili-api";
import { isNoFaceAvatar } from "@/core/dom/avatar-utils";
import { AVATAR_URL_INVALID_MESSAGE, isValidAvatarUrl } from "./avatar-url";
import { isFakeNoFaceAvatarFromImg } from "./perceptual-hash";
import { logger } from "@/utils/logger";
import {
  getUserListStore,
} from "./panel-core";
import { validateInputLength } from "@/core/dom/text-utils";

const processedUID = new WeakSet<Element>();

export type MemoDetailDialogStore = {
  isOpen: boolean;
  uid: string;
  detail: string;
  open(uid: string): Promise<void>;
  close(): void;
  handleInput(input: HTMLTextAreaElement): void;
  /** 失焦即落库，无需再点保存按钮 */
  save(): void;
};

export function registerMemoDetailDialog() {
  if (Alpine.store("memoDetailDialog")) return;

  Alpine.store("memoDetailDialog", {
    isOpen: false,
    uid: "",
    detail: "",

    async open(this: MemoDetailDialogStore, uid: string) {
      this.uid = uid;
      this.detail = "";
      const list = getUserListStore();
      // 面板列表可能还没加载，先加载再回填草稿，否则会把已有的详细备注覆盖成新输入
      await list.ensureUsersLoaded();
      if (this.uid !== uid) return;
      this.detail = list.getUserById(uid)?.memoDetail || "";
      this.isOpen = true;
    },

    close(this: MemoDetailDialogStore) {
      // 关闭 = 放弃本次改动（× 和 Esc 都走这里），保存只由 textarea 失焦触发。
      // 清掉 uid 是为了兜住「dialog 关闭时浏览器给仍聚焦的 textarea 补一次 blur」，
      // 那次 blur 会晚于本次 close() 到达，不清就会把已经放弃的内容写回去。
      this.uid = "";
      this.isOpen = false;
    },

    save(this: MemoDetailDialogStore) {
      const uid = this.uid;
      if (!uid) return;
      // 传空串（而非 undefined）才能真正清空；undefined 会被 store 当成「未提供」
      getUserListStore().updateUser(uid, { memoDetail: this.detail.trim() });
    },
    handleInput(this: MemoDetailDialogStore, input: HTMLTextAreaElement) {
      validateInputLength(input);
    },
  });
}

export function registerUserCard() {
  Alpine.data("userCard", (userId: string) => ({
    userId,
    get currentUser(): BiliUser | undefined {
      return getUserListStore().getUserById(this.userId);
    },
    get isVisible(): boolean {
      return getUserListStore().isUserVisible(this.userId);
    },
    get detailMatch(): DetailMatch | null {
      return getUserListStore().getDetailMatch(this.userId);
    },
    get isSelected(): boolean {
      return getUserListStore().selectedIds.includes(this.userId);
    },
    get isMultiSelect(): boolean {
      return getUserListStore().isMultiSelect;
    },
    get selectedIds(): string[] {
      return getUserListStore().selectedIds;
    },
    set selectedIds(next: string[]) {
      getUserListStore().selectedIds = next;
    },
    toggleSelected() {
      const next = new Set(getUserListStore().selectedIds);
      if (next.has(this.userId)) next.delete(this.userId);
      else next.add(this.userId);
      getUserListStore().selectedIds = Array.from(next);
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
        getUserListStore().removeUser(this.userId);
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
      this.$nextTick(() => {
        const element = this.$el.querySelector<HTMLElement>(".user-id");
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
    get currentUser(): BiliUser | undefined {
      return getUserListStore().getUserById(this.userId);
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
      const img = this.$el.querySelector<HTMLImageElement>("img.user-avatar");
      if (!img) {
        logger.debug("[avatarEditor] 未找到头像img元素");
        return;
      }
      this.fakeNoFace = isFakeNoFaceAvatarFromImg(img);
      this.checked = true;
    },
    handleMiddleClick(event: MouseEvent) {
      if (event.button !== 1) return;
      if (getUserListStore().isMultiSelect) return;
      if (isNoFaceAvatar(this.currentAvatar)) return;

      event.preventDefault();

      if (getUserListStore().silentAvatarUpdate) {
        const disableSilent = confirmDialog(
          "是否同时关闭静默更新头像功能？\n关闭后访问空间页将不再自动更新此用户头像。",
        );
        if (disableSilent) {
          getUserListStore().setSilentAvatarUpdate(false);
        }
      }

      const nextAvatar = promptText("请输入头像 URL");
      if (!nextAvatar) return;

      if (!isValidAvatarUrl(nextAvatar)) {
        showAlert(AVATAR_URL_INVALID_MESSAGE);
        return;
      }

      getUserListStore().updateUser(this.userId, { avatar: nextAvatar });
    },
    editAvatar(event: MouseEvent) {
      if (getUserListStore().isMultiSelect || !this.canEditAvatar) {
        return;
      }
      event.preventDefault();

      const nextAvatar = promptText("请输入头像 URL");
      if (!nextAvatar) return;

      if (!isValidAvatarUrl(nextAvatar)) {
        showAlert(AVATAR_URL_INVALID_MESSAGE);
        return;
      }

      getUserListStore().updateUser(this.userId, { avatar: nextAvatar });
    },
  }));
}

export function registerMemoEditor() {
  Alpine.data("memoEditor", (userId: string) => ({
    userId,
    isEditing: false,
    get isMultiSelect(): boolean {
      return getUserListStore().isMultiSelect;
    },
    /**
     * x-model 会识别 `{ get, set }` 形态的值并调用它的 setter
     * （见 Alpine 源码 x-model.js 的 isGetterSetter 分支），
     * 配合模板侧的 `x-model.blur` 就能只在失焦时写回 store，省掉整套 draft 状态机。
     */
    get memo(): { get(): string; set(value: string): void } {
      const userList = getUserListStore();
      return {
        get: () => userList.getUserById(userId)?.memo ?? "",
        set: (value) => userList.updateUser(userId, { memo: value }),
      };
    },
    /**
     * Esc 回滚。草稿层被去掉后 input.value 是唯一的暂存区，
     * 所以必须先把 DOM 值显式恢复成 store 里的旧值，再让它失焦——
     * 随后 x-model.blur 写回同一个值，等于幂等。
     */
    cancelEdit() {
      const input = this.$refs.memoInput as HTMLInputElement | undefined;
      if (input) input.value = getUserListStore().getUserById(userId)?.memo ?? "";
      input?.blur();
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

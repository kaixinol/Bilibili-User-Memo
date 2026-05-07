import { logger } from "../../utils/logger";
import type { BiliUser } from "../types";
import { getUserAvatarFromDOM, isNoFaceAvatar, DEFAULT_AVATAR_URL } from "../dom/dom-utils";
import { GM_addValueChangeListener } from "$";
import {
  DEFAULT_DISPLAY_MODE,
  DISPLAY_MODE_KEY,
  USERS_KEY,
  loadDisplayModeFromStorage,
  loadUsersFromStorage,
  normalizeDisplayMode,
  normalizeUsers,
  saveDisplayModeToStorage,
  saveUsersToStorage,
} from "./user-storage";
import { findUniqueUserByName } from "./name-match";

type ChangeReason =
  | "refresh"
  | "remote"
  | "update"
  | "remove"
  | "import"
  | "profile";

export type UserStoreChange =
  | {
      type: "users";
      users: BiliUser[];
      reason: ChangeReason;
      changedIds?: string[];
      rescanMatchByName?: boolean;
    }
  | {
      type: "displayMode";
      displayMode: number;
      reason: ChangeReason;
    }
  | {
      type: "full";
      users: BiliUser[];
      displayMode: number;
      reason: ChangeReason;
    };

type StoreListener = (change: UserStoreChange) => void;
type UserUpdates = Partial<Pick<BiliUser, "nickname" | "avatar" | "memo">>;

interface UserDiffResult {
  changedIds: string[];
  hasContentChanges: boolean;
  orderOnly: boolean;
  rescanMatchByName: boolean;
}

function cloneUsers(users: BiliUser[]): BiliUser[] {
  return users.map((u) => ({ ...u }));
}

function usersEqual(a: BiliUser[], b: BiliUser[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (
      a[i].id !== b[i].id ||
      a[i].nickname !== b[i].nickname ||
      a[i].avatar !== b[i].avatar ||
      a[i].memo !== b[i].memo
    ) {
      return false;
    }
  }
  return true;
}

function userContentEqual(a: BiliUser, b: BiliUser): boolean {
  return (
    a.id === b.id &&
    a.nickname === b.nickname &&
    a.avatar === b.avatar &&
    a.memo === b.memo
  );
}

function diffUsers(previous: BiliUser[], next: BiliUser[]): UserDiffResult {
  if (usersEqual(previous, next)) {
    return {
      changedIds: [],
      hasContentChanges: false,
      orderOnly: false,
      rescanMatchByName: false,
    };
  }

  const previousMap = new Map(previous.map((user) => [user.id, user]));
  const nextMap = new Map(next.map((user) => [user.id, user]));
  const changedIds = new Set<string>();
  let hasContentChanges = false;
  let rescanMatchByName = false;

  next.forEach((user) => {
    const existing = previousMap.get(user.id);
    if (!existing) {
      changedIds.add(user.id);
      hasContentChanges = true;
      rescanMatchByName = true;
      return;
    }
    if (userContentEqual(existing, user)) return;

    changedIds.add(user.id);
    hasContentChanges = true;
    if (existing.nickname !== user.nickname) {
      rescanMatchByName = true;
    }
  });

  previous.forEach((user) => {
    if (nextMap.has(user.id)) return;
    changedIds.add(user.id);
    hasContentChanges = true;
  });

  return {
    changedIds: Array.from(changedIds),
    hasContentChanges,
    orderOnly: !hasContentChanges,
    rescanMatchByName,
  };
}

class UserStore {
  private users: BiliUser[] = [];
  private _displayMode = DEFAULT_DISPLAY_MODE;
  private listeners = new Set<StoreListener>();

  constructor() {
    this.refreshData();
    // 初始化跨标签页/跨域监听
    this.listenToRemoteChanges();

    // 【重要】绝对不要在这里或 main.ts 添加 window.addEventListener('beforeunload', ...)
    // 依赖实时保存 (updateUserMemo) 和 GM_addValueChangeListener 即可。
  }

  /**
   * 从油猴存储刷新数据 (初始化用)
   */
  public refreshData() {
    const { raw: rawUsers, users: nextUsers } = loadUsersFromStorage();
    const nextDisplayMode = loadDisplayModeFromStorage();

    const usersChanged = !usersEqual(this.users, nextUsers);
    const modeChanged = this._displayMode !== nextDisplayMode;

    this.users = nextUsers;
    this._displayMode = nextDisplayMode;

    // 仅在有清理动作时回写，避免无意义写入
    if (Array.isArray(rawUsers) && this.users.length !== rawUsers.length) {
      saveUsersToStorage(this.users);
    }

    if (usersChanged || modeChanged) {
      this.emit({
        type: "full",
        users: this.getUsers(),
        displayMode: this._displayMode,
        reason: "refresh",
      });
    }

    logger.debug(
      `📊 Store 数据已刷新: 记录数=${this.users.length}, 模式=${this._displayMode}`,
    );
  }

  /**
   * 监听来自其他标签页或域名的 GM_setValue 变更
   */
  private listenToRemoteChanges() {
    GM_addValueChangeListener(USERS_KEY, (_name, _oldValue, newValue, remote) => {
      if (!remote) return;
      this.applyRemoteUsers(newValue);
    });

    GM_addValueChangeListener(
      DISPLAY_MODE_KEY,
      (_name, _oldValue, newValue, remote) => {
        if (!remote) return;
        this.applyRemoteDisplayMode(newValue);
      },
    );
  }

  private applyRemoteUsers(rawUsers: unknown) {
    logger.debug("🔄 [Sync] 检测到外部数据变更，正在同步...");
    try {
      const nextUsers = normalizeUsers(rawUsers);
      const diff = diffUsers(this.users, nextUsers);
      if (!diff.hasContentChanges && !diff.orderOnly) return;

      this.users = nextUsers;
      if (diff.orderOnly) {
        this.emitUsers("remote");
        return;
      }
      this.emitUsers("remote", diff.changedIds, diff.rescanMatchByName);
    } catch (error) {
      logger.error("同步外部数据失败", error);
    }
  }

  private applyRemoteDisplayMode(rawMode: unknown) {
    const nextMode = normalizeDisplayMode(rawMode);
    if (nextMode === this._displayMode) return;

    this._displayMode = nextMode;
    this.emitDisplayMode("remote");
  }

  public get displayMode(): number {
    return this._displayMode;
  }

  public getUsers(): BiliUser[] {
    return cloneUsers(this.users);
  }

  public subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setDisplayMode(mode: number) {
    const nextMode = normalizeDisplayMode(mode);
    if (nextMode === this._displayMode) return;

    this._displayMode = nextMode;
    saveDisplayModeToStorage(nextMode);
    this.emitDisplayMode("update");
  }
  /**
   * 获取用户记录；不存在时返回临时对象（不入库）
   */
  public ensureUser(uid: string, originalName: string): BiliUser {
    const existing = this.users.find((u) => u.id === uid);
    if (existing) {
      return existing;
    }

    // 仅用于当前页面显示，不写入 this.users，避免产生大量空 memo 记录
    const nickname = originalName || uid;
    return {
      id: uid,
      nickname,
      avatar: DEFAULT_AVATAR_URL,
      memo: "",
    };
  }

  /**
   * 通过名称查找已存在的用户 (用于无 UID 场景的回退查找)
   */
  public findUserByName(name: string): BiliUser | undefined {
    return findUniqueUserByName(this.users, name).user;
  }

  /**
   * 更新或创建用户记录
   */
  public updateUser(
    uid: string,
    updates: UserUpdates,
    fallbackName = "",
  ): boolean {
    if (!uid) return false;

    const userIndex = this.findUserIndex(uid);
    const existing = userIndex === -1 ? null : this.users[userIndex];
    const nextMemo = this.resolveNextMemo(existing, updates);

    if (!existing) {
      return this.createUserIfNeeded(uid, updates, fallbackName, nextMemo);
    }

    if (!nextMemo) {
      return this.removeExistingUser(uid, userIndex);
    }

    const nextNickname =
      updates.nickname !== undefined
        ? updates.nickname.trim()
        : existing.nickname;
    const nextAvatar =
      updates.avatar !== undefined ? updates.avatar : existing.avatar;

    if (
      existing.memo === nextMemo &&
      existing.nickname === nextNickname &&
      existing.avatar === nextAvatar
    ) {
      return false;
    }

    existing.memo = nextMemo;
    existing.nickname = nextNickname || uid;
    existing.avatar = nextAvatar;
    this.commitUsers("update", [uid]);
    logger.info(`📝 备注已更新 | UID:${uid} -> ${nextMemo}`);
    return true;
  }

  public updateUserMemo(
    uid: string,
    newMemo: string,
    fallbackName = "",
  ): boolean {
    return this.updateUser(uid, { memo: newMemo }, fallbackName);
  }

  private findUserIndex(uid: string): number {
    return this.users.findIndex((u) => u.id === uid);
  }

  private resolveNextMemo(existing: BiliUser | null, updates: UserUpdates): string {
    if (updates.memo !== undefined) return updates.memo.trim();
    return (existing?.memo || "").trim();
  }

  private createUserIfNeeded(
    uid: string,
    updates: UserUpdates,
    fallbackName: string,
    nextMemo: string,
  ): boolean {
    if (!nextMemo) return false;

    this.users.push({
      id: uid,
      nickname: (updates.nickname || fallbackName || uid).trim(),
      avatar: updates.avatar ?? getUserAvatarFromDOM(uid),
      memo: nextMemo,
    });
    this.commitUsers("update", [uid]);
    logger.info(`📝 备注已更新 | UID:${uid} -> ${nextMemo}`);
    return true;
  }

  private removeExistingUser(uid: string, userIndex: number): boolean {
    this.users.splice(userIndex, 1);
    this.commitUsers("remove", [uid]);
    logger.info(`🗑️ 备注清空，已删除用户记录 | UID:${uid}`);
    return true;
  }

  public removeUser(uid: string): boolean {
    if (!uid) return false;
    const index = this.users.findIndex((u) => u.id === uid);
    if (index === -1) return false;

    this.users.splice(index, 1);
    this.commitUsers("remove", [uid]);
    return true;
  }

  public removeUsers(ids: string[]): number {
    const idSet = new Set(ids.filter(Boolean));
    if (idSet.size === 0) return 0;

    const before = this.users.length;
    this.users = this.users.filter((u) => !idSet.has(u.id));
    const removed = before - this.users.length;
    if (removed > 0) {
      this.commitUsers("remove", Array.from(idSet));
    }
    return removed;
  }

  public upsertImportedUsers(importedUsers: BiliUser[]): {
    added: number;
    updated: number;
  } {
    const normalized = normalizeUsers(importedUsers);
    if (normalized.length === 0) return { added: 0, updated: 0 };

    let added = 0;
    let updated = 0;
    const changedIds: string[] = [];
    const userMap = new Map(this.users.map((u) => [u.id, u]));

    normalized.forEach((incoming) => {
      const existing = userMap.get(incoming.id);
      if (!existing) {
        this.users.push({ ...incoming });
        userMap.set(incoming.id, this.users[this.users.length - 1]);
        added++;
        changedIds.push(incoming.id);
        return;
      }

      // Protect existing custom avatar from being overwritten by default avatar
      let finalAvatar = incoming.avatar;
      if (
        isNoFaceAvatar(incoming.avatar) &&
        !isNoFaceAvatar(existing.avatar)
      ) {
        finalAvatar = existing.avatar;
      }

      if (
        existing.nickname === incoming.nickname &&
        existing.avatar === finalAvatar &&
        existing.memo === incoming.memo &&
        existing.isDeleted === incoming.isDeleted
      ) {
        return;
      }

      existing.nickname = incoming.nickname;
      existing.avatar = finalAvatar;
      existing.memo = incoming.memo;
      if (incoming.isDeleted !== undefined) {
        existing.isDeleted = incoming.isDeleted;
      }
      updated++;
      changedIds.push(incoming.id);
    });

    if (added > 0 || updated > 0) {
      this.commitUsers("import", changedIds, true);
    }

    return { added, updated };
  }

  public updateUserProfiles(
    profiles: Array<{ id: string; nickname: string; avatar: string; isDeleted?: boolean }>,
  ): number {
    if (profiles.length === 0) return 0;

    let updatedCount = 0;
    const changedIds: string[] = [];
    const userMap = new Map(this.users.map((u) => [u.id, u]));

    profiles.forEach((profile) => {
      const target = userMap.get(profile.id);
      if (!target) return;

      // Protect existing custom avatar from being overwritten by default avatar
      let finalAvatar = profile.avatar;
      if (
        isNoFaceAvatar(profile.avatar) &&
        !isNoFaceAvatar(target.avatar)
      ) {
        finalAvatar = target.avatar;
      }

      if (
        target.nickname === profile.nickname &&
        target.avatar === finalAvatar &&
        target.isDeleted === profile.isDeleted
      ) {
        return;
      }

      target.nickname = profile.nickname || target.nickname;
      target.avatar = finalAvatar;
      if (profile.isDeleted !== undefined) {
        target.isDeleted = profile.isDeleted;
      }
      updatedCount++;
      changedIds.push(profile.id);
    });

    if (updatedCount > 0) {
      this.commitUsers("profile", changedIds);
    }

    return updatedCount;
  }

  private commitUsers(
    reason: ChangeReason,
    changedIds: string[] = [],
    rescanMatchByName = reason === "import",
  ) {
    saveUsersToStorage(this.users);
    this.emitUsers(reason, changedIds, rescanMatchByName);
  }

  private emitUsers(
    reason: ChangeReason,
    changedIds: string[] = [],
    rescanMatchByName = false,
  ) {
    this.emit({
      type: "users",
      users: this.getUsers(),
      reason,
      changedIds,
      rescanMatchByName,
    });
  }

  private emitDisplayMode(reason: ChangeReason) {
    this.emit({
      type: "displayMode",
      displayMode: this._displayMode,
      reason,
    });
  }

  private emit(change: UserStoreChange) {
    this.listeners.forEach((listener) => {
      try {
        listener(change);
      } catch (error) {
        logger.error("UserStore 监听器执行失败", error);
      }
    });
  }
}

export const userStore = new UserStore();

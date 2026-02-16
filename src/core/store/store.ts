import { logger } from "../../utils/logger";
import { BiliUser } from "../types/types";
import { getUserAvatar } from "../dom/dom-utils";
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

class UserStore {
  private users: BiliUser[] = [];
  private _displayMode = DEFAULT_DISPLAY_MODE;
  private listeners = new Set<StoreListener>();

  // 标记是否正在进行系统级的数据变更
  // private 访问权限，强制通过方法修改
  private isSystemChanging = false;

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
    // 1. 监听用户列表变更
    GM_addValueChangeListener(
      USERS_KEY,
      (name, oldValue, newValue, remote) => {
        // 如果正在进行本地系统写入，忽略可能的即时回传，避免冲突
        if (this.isSystemChanging) return;

        // remote = true 表示变更来自其他标签页/脚本实例
        if (remote) {
          logger.debug("🔄 [Sync] 检测到外部数据变更，正在同步...");

          // 标记为正在变更，防止触发连锁反应
          this.isSystemChanging = true;

          try {
            this.users = normalizeUsers(newValue);
            this.emit({
              type: "users",
              users: this.getUsers(),
              reason: "remote",
            });
          } catch (e) {
            logger.error("同步外部数据失败", e);
          } finally {
            // 确保释放锁
            this.isSystemChanging = false;
          }
        }
      },
    );

    // 2. 监听显示模式变更
    GM_addValueChangeListener(
      DISPLAY_MODE_KEY,
      (name, oldValue, newValue, remote) => {
        if (remote) {
          const nextMode = normalizeDisplayMode(newValue);
          if (nextMode !== this._displayMode) {
            this._displayMode = nextMode;
            this.emit({
              type: "displayMode",
              displayMode: this._displayMode,
              reason: "remote",
            });
          }
        }
      },
    );
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
    this.withSystemLock(() => {
      saveDisplayModeToStorage(nextMode);
    });

    this.emit({
      type: "displayMode",
      displayMode: this._displayMode,
      reason: "update",
    });
  }

  /**
   * 获取用户记录；不存在时返回临时对象（不入库）
   */
  public ensureUser(uid: string, originalName: string): BiliUser {
    const existing = this.users.find((u) => u.id === uid);
    if (existing) {
      // 历史数据可能因选择器异常被写成 UID，这里在拿到真实名字时回填
      if (originalName && (!existing.nickname || existing.nickname === uid)) {
        existing.nickname = originalName;
      }
      return existing;
    }

    // 仅用于当前页面显示，不写入 this.users，避免产生大量空 memo 记录
    const nickname = originalName || uid;
    return {
      id: uid,
      nickname,
      avatar: getUserAvatar(uid),
      memo: "",
    };
  }

  /**
   * 通过名称查找已存在的用户 (用于无 UID 场景的回退查找)
   */
  public findUserByName(name: string): BiliUser | undefined {
    if (!name) return undefined;
    return this.users.find((u) => u.nickname === name.trim());
  }

  /**
   * 更新或创建用户记录
   */
  public updateUser(
    uid: string,
    updates: Partial<Pick<BiliUser, "nickname" | "avatar" | "memo">>,
    fallbackName = "",
  ): boolean {
    if (!uid) return false;

    const userIndex = this.users.findIndex((u) => u.id === uid);
    const existing = userIndex === -1 ? null : this.users[userIndex];
    const nextMemo =
      updates.memo !== undefined
        ? updates.memo.trim()
        : (existing?.memo || "").trim();

    if (!existing) {
      // 不创建空备注记录
      if (!nextMemo) return false;
      const created: BiliUser = {
        id: uid,
        nickname: (updates.nickname || fallbackName || uid).trim(),
        avatar: updates.avatar ?? getUserAvatar(uid),
        memo: nextMemo,
      };
      this.users.push(created);
      this.commitUsers("update", [uid]);
      logger.info(`📝 备注已更新 | UID:${uid} -> ${nextMemo}`);
      return true;
    }

    if (!nextMemo) {
      this.users.splice(userIndex, 1);
      this.commitUsers("remove", [uid]);
      logger.info(`🗑️ 备注清空，已删除用户记录 | UID:${uid}`);
      return true;
    }

    const nextNickname =
      updates.nickname !== undefined ? updates.nickname.trim() : existing.nickname;
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

  public updateUserMemo(uid: string, newMemo: string, fallbackName = ""): boolean {
    return this.updateUser(uid, { memo: newMemo }, fallbackName);
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

      if (
        existing.nickname === incoming.nickname &&
        existing.avatar === incoming.avatar &&
        existing.memo === incoming.memo
      ) {
        return;
      }

      existing.nickname = incoming.nickname;
      existing.avatar = incoming.avatar;
      existing.memo = incoming.memo;
      updated++;
      changedIds.push(incoming.id);
    });

    if (added > 0 || updated > 0) {
      this.commitUsers("import", changedIds);
    }

    return { added, updated };
  }

  public updateUserProfiles(
    profiles: Array<{ id: string; nickname: string; avatar: string }>,
  ): number {
    if (profiles.length === 0) return 0;

    let updatedCount = 0;
    const changedIds: string[] = [];
    const userMap = new Map(this.users.map((u) => [u.id, u]));

    profiles.forEach((profile) => {
      const target = userMap.get(profile.id);
      if (!target) return;
      if (
        target.nickname === profile.nickname &&
        target.avatar === profile.avatar
      ) {
        return;
      }
      target.nickname = profile.nickname || target.nickname;
      target.avatar = profile.avatar || target.avatar;
      updatedCount++;
      changedIds.push(profile.id);
    });

    if (updatedCount > 0) {
      this.commitUsers("profile", changedIds);
    }

    return updatedCount;
  }

  private withSystemLock(action: () => void) {
    this.isSystemChanging = true;
    try {
      action();
    } finally {
      this.isSystemChanging = false;
    }
  }

  private commitUsers(reason: ChangeReason, changedIds: string[] = []) {
    this.withSystemLock(() => {
      saveUsersToStorage(this.users);
    });
    this.emit({
      type: "users",
      users: this.getUsers(),
      reason,
      changedIds,
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

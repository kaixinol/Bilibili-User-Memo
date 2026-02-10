// src/core/store.ts
import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import Alpine from "alpinejs";
import { logger } from "../utils/logger";
import { BiliUser } from "./types";
import { getUserAvatar, formatDisplayName } from "./dom-utils";
import { querySelectorAllDeep } from "query-selector-shadow-dom";

class UserStore {
  public users: BiliUser[] = [];
  public displayMode: number = 2;

  // 标记是否正在进行系统级的数据变更，防止观察者循环触发
  public isSystemChanging = false;

  constructor() {
    this.refreshData();
  }

  /**
   * 从油猴存储刷新数据
   */
  public refreshData() {
    this.users = GM_getValue<BiliUser[]>("biliUsers", []);
    this.displayMode = GM_getValue<number>("displayMode", 2);
    logger.debug(
      `📊 Store 数据已刷新: 记录数=${this.users.length}, 模式=${this.displayMode}`,
    );
  }

  /**
   * 获取或创建一个用户记录 (仅内存，不保存)
   */
  public ensureUser(uid: string, originalName: string): BiliUser {
    const existing = this.users.find((u) => u.id === uid);
    if (existing) return existing;

    const nickname = originalName || uid;
    const newUser: BiliUser = {
      id: uid,
      nickname,
      avatar: getUserAvatar(uid),
      memo: "",
    };
    // 注意：这里 push 到内存是为了缓存，但只有设置了 memo 才会持久化
    this.users.push(newUser);
    return newUser;
  }

  /**
   * 更新用户备注的核心逻辑
   * 包含：更新内存 -> 更新存储 -> 同步 Alpine -> 同步 DOM
   */
  public updateUserMemo(uid: string, newMemo: string, fallbackName = "") {
    this.isSystemChanging = true;

    // 1. 更新内存
    let userIndex = this.users.findIndex((u) => u.id === uid);
    let user: BiliUser;

    if (userIndex === -1) {
      user = {
        id: uid,
        nickname: fallbackName || uid,
        avatar: getUserAvatar(uid),
        memo: newMemo,
      };
      this.users.push(user);
      userIndex = this.users.length - 1;
    } else {
      user = this.users[userIndex];
      user.memo = newMemo;
    }

    // 2. 持久化 (如果备注为空则删除)
    if (newMemo.trim() === "") {
      this.users.splice(userIndex, 1);
      logger.info(`🗑️ 备注清空，已删除用户记录 | UID:${uid}`);
    } else {
      logger.info(`📝 备注已更新 | UID:${uid} -> ${newMemo}`);
    }
    GM_setValue("biliUsers", this.users);

    // 3. 同步到 Alpine Store (UI 面板)
    this.syncToAlpine(uid, newMemo, user);

    // 4. 同步到页面 DOM
    this.syncDomNodes(uid, newMemo, user, fallbackName);

    // 给予一点缓冲时间让 DOM 更新完成
    setTimeout(() => {
      this.isSystemChanging = false;
    }, 100);
  }

  private syncToAlpine(uid: string, newMemo: string, user: BiliUser) {
    try {
      const store = Alpine.store("userList") as any;
      if (!store || !store.users) return;

      const storeIndex = store.users.findIndex((u: BiliUser) => u.id === uid);

      if (newMemo.trim() === "") {
        if (storeIndex !== -1) {
          store.users.splice(storeIndex, 1);
        }
      } else {
        if (storeIndex !== -1) {
          store.users[storeIndex].memo = newMemo;
        } else {
          // 深度克隆以避免引用问题
          store.users.push({ ...user });
        }
      }
    } catch {
      // 面板可能未打开/初始化，忽略错误
    }
  }

  private syncDomNodes(
    uid: string,
    newMemo: string,
    user: BiliUser,
    fallbackName: string,
  ) {
    const allTags = querySelectorAllDeep(
      `.bili-memo-tag[data-bili-uid="${uid}"], .editable-textarea[data-bili-uid="${uid}"]`,
    );

    allTags.forEach((tag) => {
      // 优先使用 tag 上保存的原始名，其次是传入的 fallback
      const originalName =
        tag.getAttribute("data-bili-original") || fallbackName;

      if (newMemo.trim() === "") {
        tag.textContent = originalName;
        tag.classList.remove("bili-memo-tag");
      } else {
        tag.textContent = formatDisplayName(
          user,
          originalName,
          this.displayMode,
        );
        // 确保有 tag class
        if (
          !tag.classList.contains("bili-memo-tag") &&
          tag.classList.contains("editable-textarea") === false
        ) {
          tag.classList.add("bili-memo-tag");
        }
      }
    });
  }
}

export const userStore = new UserStore();

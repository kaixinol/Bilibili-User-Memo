import Alpine from "alpinejs";
import { logger } from "../utils/logger";
import { BiliUser } from "./types";
import { getUserAvatar, formatDisplayName } from "./dom-utils";
import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { GM_getValue, GM_setValue, GM_addValueChangeListener } from "$";
class UserStore {
  public users: BiliUser[] = [];
  public displayMode: number = 2;

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
    const raw = GM_getValue<BiliUser[]>("biliUsers", []);
    const rawUsers = Array.isArray(raw) ? raw : [];
    const cleaned = new Map<string, BiliUser>();

    // 清理历史污染数据：去重 + 过滤空 memo 记录
    rawUsers.forEach((u) => {
      if (!u?.id) return;
      if (!u.memo?.trim()) return;
      cleaned.set(u.id, u);
    });

    this.users = Array.from(cleaned.values());
    this.displayMode = GM_getValue<number>("displayMode", 2);

    // 仅在有清理动作时回写，避免无意义写入
    if (this.users.length !== rawUsers.length) {
      GM_setValue("biliUsers", this.users);
    }

    logger.debug(
      `📊 Store 数据已刷新: 记录数=${this.users.length}, 模式=${this.displayMode}`,
    );
  }

  /**
   * 监听来自其他标签页或域名的 GM_setValue 变更
   */
  private listenToRemoteChanges() {
    // 1. 监听用户列表变更
    GM_addValueChangeListener(
      "biliUsers",
      (name, oldValue, newValue, remote) => {
        // 如果正在进行本地系统写入，忽略可能的即时回传，避免冲突
        if (this.isSystemChanging) return;

        // remote = true 表示变更来自其他标签页/脚本实例
        if (remote) {
          logger.debug("🔄 [Sync] 检测到外部数据变更，正在同步...");

          // 标记为正在变更，防止触发连锁反应
          this.isSystemChanging = true;

          try {
            this.users = newValue || [];
            this.syncFullStateToAlpine();
            this.refreshAllDomNodes();
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
      "displayMode",
      (name, oldValue, newValue, remote) => {
        if (remote) {
          this.displayMode = newValue ?? 2;
          this.refreshAllDomNodes();
        }
      },
    );
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
   * 更新用户备注的核心逻辑
   * 包含：更新内存 -> 更新存储 -> 同步 Alpine -> 同步 DOM
   */
  public updateUserMemo(uid: string, newMemo: string, fallbackName = "") {
    // 如果已经处于锁定状态，可能是短时间内重复调用，可以做防抖处理或直接返回
    // 这里选择直接执行，但加上锁保护
    this.isSystemChanging = true;

    try {
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

      // 核心保存动作
      GM_setValue("biliUsers", this.users);

      // 3. 同步到 Alpine Store (UI 面板)
      this.syncToAlpine(uid, newMemo, user);

      // 4. 同步到页面 DOM
      this.syncDomNodes(uid, newMemo, user, fallbackName);
    } catch (error) {
      logger.error("保存备注时发生错误", error);
    } finally {
      // 【关键】使用 finally 确保锁一定会被解开
      // 给予一点缓冲时间 (debounce buffer)，防止高频操作导致的闪烁
      setTimeout(() => {
        this.isSystemChanging = false;
      }, 200);
    }
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
          store.users.push({ ...user });
        }
      }
    } catch {
      // ignore
    }
  }

  private syncFullStateToAlpine() {
    try {
      const store = Alpine.store("userList") as any;
      if (store && store.users) {
        store.users = [...this.users];
      }
    } catch {
      // ignore
    }
  }

  private refreshAllDomNodes() {
    const allTags = querySelectorAllDeep(`[data-bili-uid]`);

    allTags.forEach((tag) => {
      const uid = tag.getAttribute("data-bili-uid");
      const originalName = tag.getAttribute("data-bili-original") || "";

      if (!uid) return;

      const user = this.users.find((u) => u.id === uid);
      const memo = user ? user.memo : "";
      const userObj = user || {
        id: uid,
        nickname: originalName,
        avatar: "",
        memo: "",
      };

      this.syncDomNodes(uid, memo, userObj, originalName);
    });
  }

  private syncDomNodes(
    uid: string,
    newMemo: string,
    user: BiliUser,
    fallbackName: string,
  ) {
    const allTags = querySelectorAllDeep(`[data-bili-uid="${uid}"]`);

    allTags.forEach((tag) => {
      const originalName =
        tag.getAttribute("data-bili-original") || fallbackName;

      if (newMemo.trim() === "") {
        tag.textContent = originalName;
        if (!tag.classList.contains("editable-textarea")) {
          tag.classList.remove("bili-memo-tag");
        }
      } else {
        tag.textContent = formatDisplayName(
          user,
          originalName,
          this.displayMode,
        );
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

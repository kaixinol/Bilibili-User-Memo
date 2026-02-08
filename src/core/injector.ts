import { GM_getValue, GM_setValue } from "vite-plugin-monkey/dist/client";
import { config, InjectionMode, StyleScope } from "../configs/rules";
import { logger } from "../utils/logger";
import Alpine from "alpinejs";
import {
  querySelectorAllDeep,
  querySelectorDeep,
} from "query-selector-shadow-dom";
import { sleep } from "../utils/sleep";
import allStyle from "../styles/memo.css?inline";
const GLOBAL_STYLE_SHEET = new CSSStyleSheet();
GLOBAL_STYLE_SHEET.replaceSync(allStyle);
interface BiliUser {
  id: string;
  nickname: string;
  avatar: string;
  memo: string;
}

type PageRule = typeof config extends Map<any, infer R> ? R : never;

class PageInjector {
  private isSystemChanging = false;
  private users: BiliUser[] = [];
  private displayMode: number = 2;
  private domReady = false;
  private staticRetired = new WeakSet<PageRule>();
  private ruleObservers = new Map<PageRule, MutationObserver>();
  private ruleDebounceTimers = new Map<PageRule, number>();
  private watchPollTimers = new Map<PageRule, number>();
  private async waitForBiliEnvironment(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        // 检查 Vue 框架和核心用户变量是否已第二次赋值（即业务逻辑已接管）
        const win = window as any;
        const isReady =
          win.__VUE__ &&
          win.__BiliUser__ &&
          Object.keys(win.__BiliUser__).length > 0;

        if (isReady) {
          logger.debug("✅ 检测到 B站核心业务环境已就绪");
          resolve();
        } else {
          setTimeout(check, 50); // 50ms 轮询
        }
      };
      check();
    });
  }
  constructor() {
    logger.info("🚀 PageInjector 正在启动...");
    this.refreshData();

    // 组合拳：等待 DOM 解析 + 等待 B站业务变量注入
    this.onDomReady(async () => {
      await this.waitForBiliEnvironment();
      // 再额外给 100ms 缓冲，避开框架挂载瞬间的 CPU 峰值
      await sleep(100);
      this.domReady = true;
      this.initAfterDomReady();
    });
  }
  public refreshData() {
    const prevUsers = this.users;
    const prevDisplayMode = this.displayMode;

    this.users = GM_getValue<BiliUser[]>("biliUsers", []);
    this.displayMode = GM_getValue<number>("displayMode", 2);

    // 计算差异 UID（新增、删除、修改）
    const prevMap = new Map(prevUsers.map((u) => [u.id, u]));
    const changedUids = new Set<string>();
    this.users.forEach((u) => {
      const prev = prevMap.get(u.id);
      if (
        !prev ||
        prev.memo !== u.memo ||
        prev.nickname !== u.nickname ||
        prev.avatar !== u.avatar
      ) {
        changedUids.add(u.id);
      }
    });
    prevMap.forEach((_, uid) => {
      if (!this.users.find((u) => u.id === uid)) changedUids.add(uid);
    });

    // 重置静态规则退休状态，仅在需要时重新扫描
    this.staticRetired = new WeakSet<PageRule>();

    logger.debug(
      `📊 数据已刷新: 记录数=${this.users.length}, 显示模式=${this.displayMode}`,
    );

    if (this.domReady) {
      // 优先更新已有节点文本
      this.refreshInjectedContent(
        prevDisplayMode !== this.displayMode ? undefined : changedUids,
      );

      // 仅清理受影响 UID 的处理标记，减少无谓重扫
      this.clearProcessedFlags(changedUids);

      // 动态区域需继续监听新节点
      this.scanMatchedRules([InjectionMode.Dynamic], "数据刷新触发");
    }
  }

  private onDomReady(callback: () => void) {
    if (
      document.readyState === "complete" ||
      document.readyState === "interactive"
    ) {
      callback();
      return;
    }
    window.addEventListener("DOMContentLoaded", () => callback(), {
      once: true,
    });
  }

  private initAfterDomReady() {
    this.scanMatchedRules(
      [InjectionMode.Static, InjectionMode.Dynamic],
      "DOM 加载完成",
    );
    this.initDynamicObservers();
  }

  private initDynamicObservers() {
    if (this.isSystemChanging) return;
    const dynamicRules = this.getMatchedRules([InjectionMode.Dynamic]) as Array<
      PageRule & { trigger: { watch: string; interval: number } }
    >;

    if (dynamicRules.length === 0) return;

    dynamicRules.forEach((rule) => {
      if (this.ruleObservers.has(rule)) return;
      this.attachObserverWhenReady(rule);
    });
  }

  private attachObserverWhenReady(
    rule: PageRule & { trigger: { watch: string; interval: number } },
  ) {
    const tryAttach = (): boolean => {
      if (this.ruleObservers.has(rule)) return true;
      const watchTargets = querySelectorAllDeep(rule.trigger.watch);
      if (watchTargets.length === 0) return false;

      const observer = new MutationObserver((mutations) => {
        const addedNodes = mutations.reduce(
          (sum, m) => sum + m.addedNodes.length,
          0,
        );
        if (addedNodes > 0) {
          this.scheduleRuleScan(
            rule,
            rule.trigger.interval,
            `DOM 变动触发 (新增节点: ${addedNodes})`,
          );
        }
      });

      watchTargets.forEach((target) => {
        const root = target.shadowRoot ?? target;
        observer.observe(root, { childList: true, subtree: true });
      });

      this.ruleObservers.set(rule, observer);
      // watch 目标刚挂载时先扫一次，避免已存在元素没触发新增节点
      this.scanSpecificRules([rule], "watch 目标已找到");
      return true;
    };

    if (tryAttach()) return;

    if (!this.watchPollTimers.has(rule)) {
      logger.warn(
        `⚠️ 规则 [${rule.name}] 未找到 watch 目标，开始每 500ms 轮询`,
      );
      const timerId = window.setInterval(() => {
        const attached = tryAttach();
        if (attached) {
          const existing = this.watchPollTimers.get(rule);
          if (existing) clearInterval(existing);
          this.watchPollTimers.delete(rule);
          logger.debug(`👀 规则 [${rule.name}] watch 目标已找到并挂载`);
        }
      }, 500);
      this.watchPollTimers.set(rule, timerId);
    }
  }

  private scheduleRuleScan(rule: PageRule, delay: number, reason: string) {
    const existing = this.ruleDebounceTimers.get(rule);
    if (existing) clearTimeout(existing);

    const timerId = window.setTimeout(() => {
      this.ruleDebounceTimers.delete(rule);
      this.scanSpecificRules([rule], reason);
    }, delay);

    this.ruleDebounceTimers.set(rule, timerId);
  }

  private scanMatchedRules(modes: InjectionMode[], reason: string) {
    if (!this.domReady) return;
    const currentUrl = window.location.href;
    const matchedRules = this.getMatchedRules(modes);
    if (matchedRules.length === 0) {
      logger.debug(`⚠️ 当前页面未匹配到任何注入规则: ${currentUrl}`);
      return;
    }

    this.scanSpecificRules(matchedRules, reason);
  }

  private scanSpecificRules(rules: PageRule[], reason: string) {
    if (!this.domReady || rules.length === 0) return;

    console.groupCollapsed(
      `💉 正在处理注入 (${new Date().toLocaleTimeString()}) | ${reason}`,
    );

    const queue = [...rules];

    const runChunk = (deadline: IdleDeadline) => {
      const timeLeft =
        typeof deadline.timeRemaining === "function"
          ? () => deadline.timeRemaining()
          : () => 0;

      const processNext = async () => {
        while (queue.length > 0 && timeLeft() > 1) {
          const rule = queue.shift()!;
          await this.scanAndInjectRule(rule);
        }

        if (queue.length > 0) {
          this.requestIdle(runChunk);
        } else {
          console.groupEnd();
        }
      };

      processNext();
    };

    this.requestIdle(runChunk);
  }

  private requestIdle(cb: (deadline: IdleDeadline) => void) {
    const ric =
      (window as any).requestIdleCallback ||
      ((fn: (deadline: IdleDeadline) => void) =>
        window.setTimeout(() => fn({ timeRemaining: () => 16 } as any), 16));
    ric(cb, { timeout: 1000 });
  }

  private async scanAndInjectRule(rule: PageRule) {
    logger.debug(`🔍 正在处理规则 [${rule.name}] ${rule.aSelector}`);
    if (
      rule.injectMode === InjectionMode.Static &&
      this.staticRetired.has(rule)
    ) {
      return 0;
    }
    const selector = `${rule.aSelector}:not([data-bili-processed])`;

    if (rule.injectMode === InjectionMode.Static) {
      let element: HTMLElement | null = null;
      const maxRetries = 15; // 增加重试次数，覆盖约 3-5 秒

      for (let i = 0; i < maxRetries; i++) {
        element = querySelectorDeep(selector);
        if (element) break;

        // 如果存在已处理的元素，说明之前已注入，直接退出不警告
        const processed = querySelectorDeep(rule.aSelector);
        if (processed && processed.hasAttribute("data-bili-processed")) {
          this.staticRetired.add(rule);
          return 0;
        }

        // 这里的 sleep 很重要，B站有些组件是滚动到位置或者异步脚本加载后才出的
        const delay = 200 + Math.random() * 300;
        await sleep(delay);
      }

      if (element) {
        this.applyRuleToElement(element, rule);
      } else {
        // 只有在彻底失败时才标记错误
        logger.warn(`🛑 规则 [${rule.name}] 未能在预定时间内捕获到元素`);
      }

      this.staticRetired.add(rule);
      return element ? 1 : 0;
    }

    const elements = querySelectorAllDeep(selector);

    if (elements.length > 0) {
      logger.info(`📍 规则 [${rule.name}] 匹配到 ${elements.length} 个新元素`);
    }

    elements.forEach((el) => {
      this.applyRuleToElement(el, rule);
    });
  }

  private applyRuleToElement(el: HTMLElement, rule: PageRule) {
    const uid = this.extractUid(el);
    const originalName = this.getElementDisplayName(el, rule);

    if (!uid) {
      logger.warn(`❌ 无法从元素提取 UID:`, el);
      return;
    }

    const user = this.users.find((u) => u.id === uid);
    const applied = this.injectMemo(el, user, rule, { uid, originalName });

    if (applied) {
      el.setAttribute("data-bili-processed", "true");
      logger.debug(
        `✅ 已为 UID:${uid} (${user?.nickname || originalName}) 注入备注`,
      );
    }
  }

  private getMatchedRules(modes?: InjectionMode[]) {
    const currentUrl = window.location.href;
    const allowedModes = modes ? new Set(modes) : null;
    // 1. 获取所有匹配当前 URL 的规则
    const matchedEntries = Array.from(config.entries()).filter(([pattern]) => {
      return pattern.test(currentUrl);
    });
    if (matchedEntries.length === 0) return [];

    return (
      matchedEntries
        .map(([_, rule]) => rule)
        // 2. 过滤掉不符合当前注入模式（Static/Dynamic）的
        .filter((rule) => !allowedModes || allowedModes.has(rule.injectMode))
        // 3. 过滤掉已经执行完毕的静态规则
        .filter(
          (rule) =>
            rule.injectMode !== InjectionMode.Static ||
            !this.staticRetired.has(rule),
        )
    );
  }

  private extractUid(el: Element): string | null {
    // 尝试从 href 提取 (最常用)
    const href = el.getAttribute("href") || location.href;
    if (href) {
      const match = href.match(/space\.bilibili\.com\/(\d+)/);
      if (match) return match[1];
    }
    const initialState = (window as any).__INITIAL_STATE__;
    const dataUid =
      (el.getAttribute("data-user-profile-id") ||
        initialState?.detail?.basic?.uid) ??
      initialState?.detail?.modules?.find((m: any) => m.module_author)
        ?.module_author?.mid;
    if (dataUid) return dataUid;
    logger.warn(`⚠️ 无法从元素中提取 UID:`, el);
    return null;
  }

  private getElementDisplayName(el: HTMLElement, rule: PageRule): string {
    if (rule.textSelector) {
      const target = el.querySelector(rule.textSelector) as HTMLElement | null;
      if (target?.textContent) return target.textContent.trim();
    }
    return el.textContent?.trim() || "";
  }

  private formatDisplayName(user: BiliUser, fallbackName: string): string {
    const nickname = (user?.nickname || fallbackName || "").trim();
    const memo = (user?.memo || "").trim();

    switch (this.displayMode) {
      case 0:
        return nickname;
      case 1:
        return memo ? `${memo}(${nickname})` : nickname;
      case 2:
        return memo ? `${nickname}(${memo})` : nickname;
      case 3:
        return memo || nickname;
      default:
        return nickname;
    }
  }
  private getUserAvatar(userID: string): string {
    return (
      querySelectorDeep(
        `#user-avatar[data-user-profile-id="${userID}"] bili-avatar source[type="image/avif"]`,
      )?.getAttribute("srcset") ||
      querySelectorDeep(
        `up-avatar-wrap a[href*="${userID}"] img.bili-avatar-img`,
      )?.getAttribute("data-src") ||
      `https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif`
    );
  }
  /**
   * 核心修改：实现就地编辑功能
   */
  private injectMemo(
    el: HTMLElement,
    user: BiliUser | undefined,
    rule: PageRule,
    meta: { uid: string; originalName: string },
  ): boolean {
    const { uid, originalName } = meta;

    if (!user) {
      user = this.ensureUserRecord(uid, originalName);
      logger.debug(
        `[injectMemo] 为缺失用户创建占位 | UID:${uid} nickname="${user.nickname}"`,
      );
    }

    const displayText = this.formatDisplayName(user, originalName);
    const scopeName = (StyleScope as any)[rule.styleScope] ?? rule.styleScope;
    logger.debug(
      `[injectMemo] 准备注入 | UID:${uid} scope=${scopeName} mode=${this.displayMode} original="${originalName}" display="${displayText}"`,
    );

    const createEditButton = () => {
      const button = document.createElement("button");
      button.textContent = "备注";
      button.classList.add("edit-button");
      button.dataset.biliUid = uid;
      button.dataset.biliScope = String(rule.styleScope);
      return button;
    };
    const createEditableSpan = () => {
      const tag = document.createElement("span");
      tag.textContent = displayText;
      tag.classList.add("editable-textarea", "bili-memo-tag");
      tag.dataset.biliUid = uid;
      tag.dataset.biliScope = String(rule.styleScope);
      tag.dataset.biliOriginal = originalName;
      tag.addEventListener("click", (e) => {
        e.stopPropagation();
        this.enterEditMode(tag, user);
      });
      return tag;
    };
    // 逻辑执行
    switch (rule.styleScope) {
      case StyleScope.Minimal: {
        el.textContent = displayText;
        el.classList.add("bili-memo-tag");
        el.dataset.biliUid = uid;
        el.dataset.biliScope = String(rule.styleScope);
        el.dataset.biliOriginal = originalName;
        this.ensureStyles(el);
        logger.debug(`[injectMemo] Minimal 应用完成 -> ${displayText}`);
        return true;
      }

      case StyleScope.Editable: {
        el.style.display = "none";
        const tag = createEditableSpan();
        el.insertAdjacentElement("afterend", tag);
        this.ensureStyles(tag);
        logger.debug(`[injectMemo] Editable 应用完成 -> ${displayText}`);
        return true;
      }

      case StyleScope.Extended: {
        // 显示部分直接复用原元素，按钮提供编辑入口
        el.textContent = displayText;
        el.classList.add("bili-memo-tag");
        el.dataset.biliUid = uid;
        el.dataset.biliScope = String(rule.styleScope);
        el.dataset.biliOriginal = originalName;

        // 若已有按钮，避免重复添加
        const existingBtn = el.nextElementSibling as HTMLElement | null;
        const canReuse =
          existingBtn?.classList.contains("edit-button") &&
          existingBtn.dataset.biliUid === uid;

        const btn = canReuse && existingBtn ? existingBtn : createEditButton();
        if (!btn) return false;
        if (!canReuse && btn) {
          btn.addEventListener("click", (e) => {
            e.stopPropagation();
            this.enterEditMode(el, user);
          });
          el.insertAdjacentElement("afterend", btn);
        }
        if (btn) this.ensureStyles(btn);
        logger.debug(`[injectMemo] Extended 应用完成 -> ${displayText}`);
        return true;
      }

      default:
        logger.warn(`⚠️ 不支持的样式作用域: ${rule.styleScope}`);
        return false;
    }
  }

  private ensureUserRecord(uid: string, originalName: string): BiliUser {
    const existing = this.users.find((u) => u.id === uid);
    if (existing) return existing;
    const nickname = originalName || uid;
    const newUser: BiliUser = {
      id: uid,
      nickname,
      avatar: this.getUserAvatar(uid),
      memo: "",
    };
    this.users.push(newUser);
    return newUser;
  }
  /**
   * 进入行内编辑模式
   */
  private enterEditMode(tag: HTMLElement, user: BiliUser) {
    if (!user) return;
    const originalName = tag.textContent;
    const currentMemo = user?.memo || originalName;
    let finished = false;

    // 创建输入框
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentMemo;
    input.className = "bili-memo-input";

    input.style.setProperty(
      "--memo-input-width",
      `${Math.max(currentMemo.length * 12, 60)}px`,
    );

    // 替换原有的 span 内容（或直接替换 span）
    const parent = tag.parentElement;
    if (!parent) return;

    tag.style.display = "none"; // 隐藏原标签
    parent.insertBefore(input, tag.nextSibling);
    input.focus();
    input.select();

    // 结束编辑的逻辑
    const finishEdit = (isSave: boolean) => {
      if (finished) return;
      finished = true;
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      tag.style.display = "inline"; // 恢复原标签

      if (isSave && input.value !== currentMemo) {
        this.updateUserMemo(
          user.id,
          input.value.trim(),
          tag.dataset.biliOriginal || tag.textContent || "",
        );
      }
    };

    // 事件绑定
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finishEdit(true);
      } else if (e.key === "Escape") {
        finishEdit(false);
      }
    };

    input.onblur = () => finishEdit(true); // 失去焦点自动保存

    // 阻止输入框冒泡，防止点击输入框触发 B 站跳转
    input.onclick = (e) => e.stopPropagation();
  }

  private updateUserMemo(uid: string, newMemo: string, fallbackName = "") {
    this.isSystemChanging = true;
    // 1. 更新 Injector 内部的缓存
    let userIndex = this.users.findIndex((u) => u.id === uid);
    if (userIndex === -1) {
      const newUser: BiliUser = {
        id: uid,
        nickname: fallbackName || uid,
        avatar: this.getUserAvatar(uid),
        memo: newMemo,
      };
      this.users.push(newUser);
      userIndex = this.users.length - 1;
    } else {
      this.users[userIndex].memo = newMemo;
    }

    // 如果备注被清空，直接删除该用户记录
    if (newMemo.trim() === "") {
      this.users.splice(userIndex, 1);
      GM_setValue("biliUsers", this.users);
      logger.info(`🗑️ 备注清空，已删除用户记录 | UID:${uid}`);
    } else {
      // 2. 持久化到油猴存储
      GM_setValue("biliUsers", this.users);
      logger.info(`📝 备注已更新 | UID:${uid} -> ${newMemo}`);
    }

    // 3. 【核心】同步到 Alpine Store (面板 UI)
    // 这样当你打开管理面板时，列表里的备注也会瞬间改变
    try {
      const store = Alpine.store("userList") as any;
      if (store && store.users) {
        const storeUserIndex = store.users.findIndex(
          (u: BiliUser) => u.id === uid,
        );
        if (newMemo.trim() === "") {
          if (storeUserIndex !== -1) {
            store.users.splice(storeUserIndex, 1);
            logger.debug(`🗑️ 已从 Alpine Store 移除 UID:${uid}`);
          }
        } else if (storeUserIndex !== -1) {
          store.users[storeUserIndex].memo = newMemo;
          logger.debug(`🔄 已同步数据到 Alpine Store`);
        } else {
          const localUser = this.users.find((u) => u.id === uid);
          if (localUser) {
            store.users.push({ ...localUser });
            logger.debug(`➕ 已将新用户推入 Alpine Store | UID:${uid}`);
          }
        }
      }
    } catch (e) {
      logger.warn("⚠️ 尝试同步到 Alpine Store 失败，面板可能尚未初始化");
    }

    // 4. 同步更新当前页面上所有显示该 UID 的标签 (即时反馈)
    this.syncAllTagsOnPage(uid, newMemo);
    setTimeout(() => {
      this.isSystemChanging = false;
    }, 100);
  }
  private syncAllTagsOnPage(uid: string, newMemo: string) {
    const user = this.users.find((u) => u.id === uid);
    const allTags = querySelectorAllDeep(
      `.bili-memo-tag[data-bili-uid="${uid}"]`,
    );

    allTags.forEach((tag) => {
      const originalName = tag.dataset.biliOriginal || "";
      if (!user || newMemo.trim() === "") {
        // 备注被清空，恢复原始显示
        tag.textContent = originalName;
      } else {
        tag.textContent = this.formatDisplayName(user, originalName);
      }
    });
  }

  private refreshInjectedContent(filterUids?: Set<string>) {
    const allTags = querySelectorAllDeep(`.bili-memo-tag`);
    allTags.forEach((tag) => {
      const uid = tag.dataset.biliUid;
      if (!uid) return;
      if (filterUids && !filterUids.has(uid)) return;

      const user = this.users.find((u) => u.id === uid);
      const originalName = tag.dataset.biliOriginal || "";

      if (!user || user.memo.trim() === "") {
        tag.textContent = originalName;
        return;
      }

      tag.textContent = this.formatDisplayName(user, originalName);
    });
  }

  private ensureStyles(target: HTMLElement) {
    const root = target.getRootNode();
    if (root instanceof ShadowRoot || root instanceof Document) {
      if (!root.adoptedStyleSheets.includes(GLOBAL_STYLE_SHEET)) {
        root.adoptedStyleSheets = [
          ...root.adoptedStyleSheets,
          GLOBAL_STYLE_SHEET,
        ];
      }
    }
  }

  private clearProcessedFlags(changedUids: Set<string>) {
    if (changedUids.size === 0) return;
    const processed = querySelectorAllDeep("[data-bili-processed]");
    processed.forEach((el) => {
      const uid = this.extractUid(el);
      if (uid && changedUids.has(uid)) {
        el.removeAttribute("data-bili-processed");
      }
    });
  }
}

let pageInjector: PageInjector | null = null;
export function initPageInjection() {
  if (!pageInjector) pageInjector = new PageInjector();
}
export function refreshPageInjection() {
  pageInjector?.refreshData();
}

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
    this.users = GM_getValue<BiliUser[]>("biliUsers", []);
    this.displayMode = GM_getValue<number>("displayMode", 2);
    logger.debug(
      `📊 数据已刷新: 记录数=${this.users.length}, 显示模式=${this.displayMode}`,
    );
    if (this.domReady) {
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

    rules.forEach((rule) => {
      this.scanAndInjectRule(rule);
    });

    console.groupEnd();
  }

  private async scanAndInjectRule(rule: PageRule) {
    logger.debug(`🔍 正在处理规则 [${rule.name}] ${rule.aSelector}`);
    if (
      rule.injectMode === InjectionMode.Static &&
      this.staticRetired.has(rule)
    ) {
      return;
    }
    const selector = `${rule.aSelector}:not([data-bili-processed])`;

    if (rule.injectMode === InjectionMode.Static) {
      let element: HTMLElement | null = null;
      const maxRetries = 15; // 增加重试次数，覆盖约 3-5 秒

      for (let i = 0; i < maxRetries; i++) {
        element = querySelectorDeep(selector);
        if (element) break;

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
      return;
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

    if (uid) {
      const user = this.users.find((u) => u.id === uid);
      this.injectMemo(el, user, rule);
      logger.debug(
        `✅ 已为 UID:${uid} (${user?.nickname || el.textContent}) 注入备注`,
      );
    } else {
      logger.warn(`❌ 无法从元素提取 UID:`, el);
    }

    el.setAttribute("data-bili-processed", "true");
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

    // 尝试从 B 站常见的自定义属性提取
    const dataUid =
      el.getAttribute("data-user-id") || el.getAttribute("data-mid");
    if (dataUid) return dataUid;

    return null;
  }

  /**
   * 核心修改：实现就地编辑功能
   */
  private injectMemo(
    el: HTMLElement,
    user: BiliUser | undefined,
    rule: PageRule,
  ) {
    /**
     * 辅助函数：确保元素所在的 Root（Document 或 ShadowRoot）加载了样式
     */
    const ensureStyles = (target: HTMLElement) => {
      const root = target.getRootNode();
      if (root instanceof ShadowRoot || root instanceof Document) {
        // 如果样式表还没被“收养”，就把它加进去
        if (!root.adoptedStyleSheets.includes(GLOBAL_STYLE_SHEET)) {
          root.adoptedStyleSheets = [
            ...root.adoptedStyleSheets,
            GLOBAL_STYLE_SHEET,
          ];
        }
      }
    };

    const createEditableTag = (text: string) => {
      const span = document.createElement("span");
      span.textContent = text || "";
      span.contentEditable = "true";
      span.classList.add("editable-textarea");
      return span;
    };

    const createEditButton = () => {
      const button = document.createElement("button");
      button.textContent = "备注";
      button.classList.add("edit-button");
      return button;
    };

    // 逻辑执行
    switch (rule.styleScope) {
      case StyleScope.Minimal:
        if (!user) return;
        el.textContent = user.memo;
        break;

      case StyleScope.Editable: {
        el.style.display = "none";
        const tag = createEditableTag(user?.memo || el.textContent || "");
        el.insertAdjacentElement("afterend", tag);
        // 关键：插入后立即查找 root 并注入样式表
        ensureStyles(tag);
        break;
      }

      case StyleScope.Extended: {
        const btn = createEditButton();
        el.insertAdjacentElement("afterend", btn);
        // 关键：插入后立即查找 root 并注入样式表
        ensureStyles(btn);
        break;
      }

      default:
        logger.warn(`⚠️ 不支持的样式作用域: ${rule.styleScope}`);
    }
  }
  /**
   * 进入行内编辑模式
   */
  private enterEditMode(tag: HTMLElement, user: BiliUser) {
    const originalText = tag.textContent;
    const currentMemo = user.memo || "";

    // 创建输入框
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentMemo;
    input.className = "bili-memo-input";

    // 继承基础样式并微调
    input.style.cssText = `
      background: #fff !important;
      border: 1px solid #ff6699 !important;
      color: #ff6699 !important;
      font-size: 12px !important;
      padding: 0 4px !important;
      margin-left: 4px !important;
      border-radius: 4px !important;
      outline: none !important;
      width: ${Math.max(currentMemo.length * 12, 60)}px !important;
      display: inline-block !important;
      height: 18px !important;
      line-height: 18px !important;
      vertical-align: middle !important;
    `;

    // 替换原有的 span 内容（或直接替换 span）
    const parent = tag.parentElement;
    if (!parent) return;

    tag.style.display = "none"; // 隐藏原标签
    parent.insertBefore(input, tag.nextSibling);
    input.focus();
    input.select();

    // 结束编辑的逻辑
    const finishEdit = (isSave: boolean) => {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
      tag.style.display = "inline"; // 恢复原标签

      if (isSave && input.value !== currentMemo) {
        this.updateUserMemo(user.id, input.value.trim());
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

  /**
   * 抽离样式设置
   */
  private applyMemoStyle(el: HTMLElement) {
    el.style.cssText = `
      color: #ff6699 !important;
      font-size: 12px !important;
      margin-left: 4px !important;
      font-weight: bold !important;
      cursor: pointer !important;
      display: inline !important;
      vertical-align: middle !important;
    `;
  }

  private updateUserMemo(uid: string, newMemo: string) {
    this.isSystemChanging = true;
    // 1. 更新 Injector 内部的缓存
    const userIndex = this.users.findIndex((u) => u.id === uid);
    if (userIndex === -1) return;

    this.users[userIndex].memo = newMemo;

    // 2. 持久化到油猴存储
    GM_setValue("biliUsers", this.users);
    logger.info(`📝 备注已更新 | UID:${uid} -> ${newMemo}`);

    // 3. 【核心】同步到 Alpine Store (面板 UI)
    // 这样当你打开管理面板时，列表里的备注也会瞬间改变
    try {
      const store = Alpine.store("userList") as any;
      if (store && store.users) {
        const storeUser = store.users.find((u: BiliUser) => u.id === uid);
        if (storeUser) {
          storeUser.memo = newMemo;
          // 如果你之前的 store 里有 searchUsers 逻辑，
          // 这里修改属性后 Alpine 会自动触发 getter (filteredUsers) 重新计算
          logger.debug(`🔄 已同步数据到 Alpine Store`);
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
    const allTags = document.querySelectorAll(`.bili-memo-tag`);
    allTags.forEach((tag) => {
      // 这里的逻辑需要确保能找到父元素关联的 UID
      const parent = tag.parentElement;
      if (parent && this.extractUid(parent) === uid) {
        // 更新文字
        tag.textContent = ` (${newMemo || "未命名"})`;
        // 如果原本是隐藏状态（正在编辑），不需要管，编辑完会自动恢复
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

import { GM_getValue } from "vite-plugin-monkey/dist/client";
import { validateEitherJSON } from "../configs/schema";
import { config, StyleScope, InjectionMode } from "../configs/rules";
import { logger } from "../utils/logger";

interface BiliUser {
  id: string;
  nickname: string;
  avatar: string;
  memo: string;
}

class PageInjector {
  private users: BiliUser[] = [];
  private displayMode: number = 2;
  private observers: MutationObserver[] = [];

  constructor() {
    this.loadUserData();
    this.setupPageDetection();
  }

  private loadUserData() {
    const savedUsers = GM_getValue<BiliUser[]>("biliUsers", []);
    this.users = savedUsers;
    this.displayMode = GM_getValue<number>("displayMode", 2);
    logger.info("Loaded users data:", this.users.length, "users");
  }

  private formatDisplayName(user: BiliUser): string {
    switch (this.displayMode) {
      case 0: // 昵称
        return user.nickname;
      case 1: // 备注(昵称)
        return (
          user.memo + (user.memo ? "(" + user.nickname + ")" : user.nickname)
        );
      case 2: // 昵称(备注)
        return user.nickname + (user.memo ? "(" + user.memo + ")" : "");
      case 3: // 备注
        return user.memo || user.nickname;
      default:
        return user.nickname;
    }
  }

  private setupPageDetection() {
    // 检查当前URL并应用对应规则
    this.applyCurrentPageRules();

    // 仅对动态规则监听页面变化
    const observer = new MutationObserver(() => {
      this.applyDynamicRulesOnly();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 监听popstate事件（浏览器前进后退）
    window.addEventListener("popstate", () => {
      this.applyCurrentPageRules(); // URL变化时仍需重新检查规则
    });

    // 监听pushState/replaceState（SPA路由）
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function (...args) {
      originalPushState.apply(history, args);
      setTimeout(() => window.dispatchEvent(new Event("pushstate")), 0);
    };

    history.replaceState = function (...args) {
      originalReplaceState.apply(history, args);
      setTimeout(() => window.dispatchEvent(new Event("replacestate")), 0);
    };

    window.addEventListener("pushstate", () => this.applyCurrentPageRules()); // URL变化时仍需重新检查规则
    window.addEventListener("replacestate", () => this.applyCurrentPageRules()); // URL变化时仍需重新检查规则
  }

  private applyCurrentPageRules() {
    const currentUrl = window.location.href;
    logger.info("Checking URL:", currentUrl);

    for (const [pattern, rule] of config) {
      const matches =
        typeof pattern === "string"
          ? currentUrl.includes(pattern)
          : pattern.test(currentUrl);

      if (matches) {
        logger.info("Matched rule:", rule.name);
        this.applyRule(rule);
        break; // 只应用第一个匹配的规则
      }
    }
  }

  // 仅应用动态规则，不重新检查模式匹配
  private applyDynamicRulesOnly() {
    const currentUrl = window.location.href;

    for (const [pattern, rule] of config) {
      const matches =
        typeof pattern === "string"
          ? currentUrl.includes(pattern)
          : pattern.test(currentUrl);

      if (matches && rule.injectMode === InjectionMode.Dynamic) {
        logger.info("Matched dynamic rule:", rule.name);
        this.applyRule(rule);
        break; // 只应用第一个匹配的规则
      }
    }
  }

  private staticRulesApplied = new Set<string>(); // 记录已应用的静态规则

  private applyRule(rule: any) {
    // 清理之前的观察者
    this.cleanupObservers();

    switch (rule.injectMode) {
      case InjectionMode.Static:
        // 检查是否已经应用过该静态规则
        if (!this.staticRulesApplied.has(rule.name)) {
          this.applyStaticRule(rule);
          this.staticRulesApplied.add(rule.name); // 标记为已应用
        }
        break;
      case InjectionMode.Dynamic:
        this.applyDynamicRule(rule);
        break;
    }
  }

  private applyStaticRule(rule: any) {
    const elements = document.querySelectorAll(rule.aSelector);
    logger.info(
      `Static mode: found ${elements.length} elements for ${rule.aSelector}`,
    );

    elements.forEach((element) => {
      // 避免重复处理
      if (!element.hasAttribute("data-bili-remark-processed")) {
        this.processElement(element, rule);
        element.setAttribute("data-bili-remark-processed", "true");
      }
    });
  }

  private applyDynamicRule(rule: any) {
    logger.info(`Dynamic mode: starting observer for ${rule.aSelector}`);

    const processElements = () => {
      const elements = document.querySelectorAll(rule.aSelector);
      logger.info(`Dynamic check: found ${elements.length} elements`);

      elements.forEach((element) => {
        // 避免重复处理
        if (!element.hasAttribute("data-bili-remark-processed")) {
          this.processElement(element, rule);
          element.setAttribute("data-bili-remark-processed", "true");
        }
      });
    };

    // 立即处理一次
    processElements();

    // 设置定时器定期检查
    const interval = setInterval(processElements, rule.trigger.interval);

    // 同时设置MutationObserver监听DOM变化
    const observer = new MutationObserver(() => {
      setTimeout(processElements, 100); // 延迟一点时间等待DOM稳定
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this.observers.push(observer);

    // 保存interval以便清理
    this.observers.push({ disconnect: () => clearInterval(interval) } as any);
  }

  private processElement(element: Element, rule: any) {
    // 提取用户ID
    const userId = this.extractUserId(element);
    if (!userId) {
      logger.debug("Could not extract user ID from element:", element);
      return;
    }

    // 查找用户数据
    const user = this.users.find((u) => u.id === userId);
    if (!user) {
      logger.debug("User not found in data:", userId);
      return;
    }

    // 根据样式范围应用不同的处理
    switch (rule.styleScope) {
      case StyleScope.Minimal:
        this.applyMinimalStyle(element, user, rule);
        break;
      case StyleScope.Editable:
        this.applyEditableStyle(element, user, rule);
        break;
      case StyleScope.Extended:
        this.applyExtendedStyle(element, user, rule);
        break;
    }
  }

  private extractUserId(element: Element): string | null {
    // 尝试从各种可能的属性中提取用户ID
    const possibleSelectors = [
      "href", // 链接中的ID
      "data-user-id",
      "data-uid",
      "data-mid",
      "data-user-id",
    ];

    // 从元素本身或父元素中查找
    let currentElement: Element | null = element;
    for (let i = 0; i < 3; i++) {
      // 最多向上查找3层
      if (!currentElement) break;

      for (const selector of possibleSelectors) {
        const value = currentElement.getAttribute(selector);
        if (value) {
          // 从URL中提取ID
          const match = value.match(/\/(\d+)/);
          if (match) {
            return match[1];
          }
          // 或者直接就是纯数字ID
          if (/^\d+$/.test(value)) {
            return value;
          }
        }
      }

      // 如果是链接元素，尝试从href中提取
      if (currentElement instanceof HTMLAnchorElement) {
        const match = currentElement.href.match(/space\.bilibili\.com\/(\d+)/);
        if (match) {
          return match[1];
        }
      }

      currentElement = currentElement.parentElement;
    }

    return null;
  }

  private applyMinimalStyle(element: Element, user: BiliUser, rule: any) {
    const targetElement = rule.textSelector
      ? element.querySelector(rule.textSelector)
      : element;

    if (!targetElement) return;

    if (targetElement && targetElement.textContent) {
      const displayName = this.formatDisplayName(user);
      targetElement.textContent = displayName;
      targetElement.setAttribute("title", `${user.nickname} (${user.memo})`);
    }
  }

  private applyEditableStyle(element: Element, user: BiliUser, rule: any) {
    const targetElement = rule.textSelector
      ? element.querySelector(rule.textSelector)
      : element;

    if (targetElement) {
      const displayName = this.formatDisplayName(user);

      // 保存原始内容
      if (!targetElement.hasAttribute("data-original-text")) {
        targetElement.setAttribute(
          "data-original-text",
          targetElement.textContent || "",
        );
      }

      targetElement.textContent = displayName;
      targetElement.style.cursor = "pointer";
      targetElement.setAttribute(
        "title",
        `${user.nickname} (${user.memo}) - 点击编辑备注`,
      );

      // 添加点击事件来编辑备注
      targetElement.addEventListener("click", (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        const newMemo = prompt(`编辑 ${user.nickname} 的备注:`, user.memo);
        if (newMemo !== null) {
          user.memo = newMemo;
          this.saveUserData();
          const newDisplayName = this.formatDisplayName(user);
          targetElement.textContent = newDisplayName;
          targetElement.setAttribute(
            "title",
            `${user.nickname} (${user.memo})`,
          );
        }
      });
    }
  }

  private applyExtendedStyle(element: Element, user: BiliUser, rule: any) {
    const targetElement = rule.textSelector
      ? element.querySelector(rule.textSelector)
      : element;

    if (targetElement) {
      const displayName = this.formatDisplayName(user);

      // 保存原始内容
      if (!targetElement.hasAttribute("data-original-text")) {
        targetElement.setAttribute(
          "data-original-text",
          targetElement.textContent || "",
        );
      }

      targetElement.textContent = displayName;
      targetElement.setAttribute("title", `${user.nickname} (${user.memo})`);

      // 创建控制按钮容器
      const controlsContainer = document.createElement("div");
      controlsContainer.className = "bili-remark-controls";
      controlsContainer.style.cssText = `
        display: inline-flex;
        gap: 4px;
        margin-left: 8px;
        font-size: 12px;
        opacity: 0;
        transition: opacity 0.2s;
      `;

      // 编辑按钮
      const editBtn = document.createElement("button");
      editBtn.textContent = "编辑";
      editBtn.style.cssText = `
        padding: 2px 6px;
        background: #fb7299;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        font-size: 11px;
      `;

      editBtn.addEventListener("click", (e: Event) => {
        e.preventDefault();
        e.stopPropagation();

        const newMemo = prompt(`编辑 ${user.nickname} 的备注:`, user.memo);
        if (newMemo !== null) {
          user.memo = newMemo;
          this.saveUserData();
          const newDisplayName = this.formatDisplayName(user);
          if (targetElement) targetElement.textContent = newDisplayName;
        }
      });

      controlsContainer.appendChild(editBtn);

      // 将控制按钮插入到目标元素后面
      if (targetElement.parentElement) {
        targetElement.parentElement.appendChild(controlsContainer);
      }

      // 鼠标悬停时显示控制按钮
      targetElement.addEventListener("mouseenter", () => {
        controlsContainer.style.opacity = "1";
      });

      targetElement.addEventListener("mouseleave", () => {
        controlsContainer.style.opacity = "0";
      });
    }
  }

  private saveUserData() {
    GM_setValue("biliUsers", this.users);
  }

  private cleanupObservers() {
    this.observers.forEach((observer) => {
      observer.disconnect();
    });
    this.observers = [];
  }

  // 公共方法：刷新用户数据（当面板数据更新时调用）
  public refreshData() {
    this.loadUserData();
    this.applyCurrentPageRules();
  }
}

// 创建单例实例
let pageInjector: PageInjector | null = null;

export function initPageInjection() {
  if (!pageInjector) {
    pageInjector = new PageInjector();
    logger.info("Page injection initialized");
  }
  return pageInjector;
}

// 导出刷新方法供其他模块调用
export function refreshPageInjection() {
  if (pageInjector) {
    pageInjector.refreshData();
  }
}

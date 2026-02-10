// src/core/renderer.ts
import { BiliUser, ElementMeta } from "./types";
import { PageRule, StyleScope } from "../configs/rules";
import { formatDisplayName } from "./dom-utils";
import { userStore } from "./store";
import { enterEditMode } from "./editor";
import { ensureStylesForElement } from "./style-manager";
import { logger } from "../utils/logger";

// ✅ 核心优化：使用 WeakMap 建立 "B站原元素" -> "我们注入的元素" 的映射
// 这样可以避免重复创建 DOM，也能防止内存泄漏（当 B 站元素被回收时，我们的记录也会自动回收）
const wrapperCache = new WeakMap<HTMLElement, HTMLElement>();

/**
 * 主渲染入口
 */
export function injectMemoRenderer(
  el: HTMLElement,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
): boolean {
  const displayText = formatDisplayName(
    user,
    meta.originalName,
    userStore.displayMode,
  );

  // 根据样式作用域分发处理逻辑
  switch (rule.styleScope) {
    case StyleScope.Minimal:
      if (!rule.textSelector) return renderMinimal(el, displayText, user, meta);
      else
        return renderMinimal(
          el.querySelector(rule.textSelector)!,
          displayText,
          user,
          meta,
        );
    case StyleScope.Editable:
      return renderEditable(el, displayText, user, rule, meta);
    default:
      logger.warn(`⚠️ 不支持的样式作用域: ${rule.styleScope}`);
      return false;
  }
}

/**
 * 策略 1: Minimal (直接修改原文本)
 */
function renderMinimal(
  el: HTMLElement,
  text: string,
  user: BiliUser,
  meta: ElementMeta,
): boolean {
  // 只有文本变了才操作 DOM，减少重绘
  if (el.textContent !== text) {
    el.textContent = text;
  }

  // 更新状态类和数据属性
  updateElementState(el, user, meta);
  ensureStylesForElement(el);
  return true;
}

/**
 * 策略 2: Editable (隐藏原元素，插入可编辑 Span)
 * ✅ 解决了重复插入 span 的问题
 */
function renderEditable(
  el: HTMLElement,
  text: string,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
): boolean {
  let wrapper = wrapperCache.get(el);

  // 如果缓存里没有，检查 DOM 里是否真的没有 (防止页面刷新残留)
  if (
    !wrapper &&
    el.nextElementSibling?.classList.contains("editable-textarea")
  ) {
    wrapper = el.nextElementSibling as HTMLElement;
    wrapperCache.set(el, wrapper);
  }

  // 1. 初始化：如果是第一次渲染
  if (!wrapper) {
    wrapper = document.createElement("span");
    wrapper.classList.add("editable-textarea");

    // 绑定点击事件 (只绑一次)
    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      enterEditMode(wrapper!, user);
    });

    // 插入 DOM
    el.style.display = "none"; // 隐藏原元素
    el.insertAdjacentElement("afterend", wrapper);

    // 存入缓存
    wrapperCache.set(el, wrapper);
  }

  // 2. 更新：无论是新建的还是缓存的，都需要更新数据
  if (wrapper.textContent !== text) {
    wrapper.textContent = text;
  }

  if (rule.fontSize) {
    wrapper.style.setProperty("--custom-font-size", rule.fontSize);
  }

  updateElementState(wrapper, user, meta);

  ensureStylesForElement(wrapper);
  return true;
}
/**
 * 通用辅助：更新元素的 Dataset 和 Class
 */
function updateElementState(
  el: HTMLElement,
  user: BiliUser,
  meta: ElementMeta,
) {
  // 设置 UID
  if (el.dataset.biliUid !== meta.uid) {
    el.dataset.biliUid = meta.uid;
  }

  // 设置原始名称 (用于恢复)
  if (el.dataset.biliOriginal !== meta.originalName) {
    el.dataset.biliOriginal = meta.originalName;
  }

  // 设置高亮 Class
  if (
    !el.classList.contains("bili-memo-tag") &&
    user.memo &&
    user.memo !== meta.originalName
  ) {
    el.classList.add("bili-memo-tag");
  }
}

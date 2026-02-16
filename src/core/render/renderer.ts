// src/core/renderer.ts
import { BiliUser, ElementMeta } from "../types";
import { PageRule, StyleScope } from "../../configs/rules";
import { resolveRuleTextTarget } from "../dom/dom-utils";
import { userStore } from "../store/store";
import { enterEditMode } from "./editor";
import { ensureStylesForElement } from "../style/style-manager";
import { logger } from "../../utils/logger";
import { syncElementMeta, syncRenderedNodeState } from "./rendered-node";

// ✅ 核心优化：使用 WeakMap 建立 "B站原元素" -> "我们注入的元素" 的映射
// 这样可以避免重复创建 DOM，也能防止内存泄漏（当 B 站元素被回收时，我们的记录也会自动回收）
const wrapperCache = new WeakMap<HTMLElement, HTMLElement>();

/**
 * 主渲染入口
 */
export async function injectMemoRenderer(
  el: HTMLElement,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
): Promise<boolean> {
  const displayMode = userStore.displayMode;
  // 根据样式作用域分发处理逻辑
  switch (rule.styleScope) {
    case StyleScope.Minimal:
      return renderMinimal(
        resolveRuleTextTarget(el, rule),
        user,
        meta,
        displayMode,
      );
    case StyleScope.Editable:
      return renderEditable(el, user, rule, meta, displayMode);
    default:
      logger.warn(`⚠️ 不支持的样式作用域: ${rule.styleScope}`);
      return false;
  }
}

/**
 * 策略 1: Minimal (直接修改原文本)
 */

function renderMinimal(
  element: HTMLElement | null,
  user: BiliUser,
  meta: ElementMeta,
  displayMode: number,
): boolean {
  if (!element) return false;

  // 只需检查一次样式
  ensureStylesForElement(element);
  syncRenderedNodeState(element, user, meta.originalName, displayMode);
  syncElementMeta(element, meta);

  return true;
}

/**
 * 策略 2: Editable (隐藏原元素，插入可编辑 Span)
 * ✅ 解决了重复插入 span 的问题
 */
function renderEditable(
  el: HTMLElement,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
  displayMode: number,
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
    // 防止被后续选择器当成未处理节点再次注入
    wrapper.setAttribute("data-bili-processed", "true");

    // 绑定点击事件 (只绑一次)
    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const uid = wrapper?.dataset.biliUid;
      const originalName = wrapper?.dataset.biliOriginal || meta.originalName;
      if (!uid) return;

      // 每次点击都从 store 取最新用户，避免闭包捕获旧对象导致编辑值回退
      const latestUser = userStore.ensureUser(uid, originalName);
      enterEditMode(wrapper!, latestUser);
    });

    // 插入 DOM
    el.style.display = "none"; // 隐藏原元素
    el.insertAdjacentElement("afterend", wrapper);

    // 存入缓存
    wrapperCache.set(el, wrapper);
  }

  // 2. 更新：无论是新建的还是缓存的，都需要更新数据
  syncRenderedNodeState(wrapper, user, meta.originalName, displayMode, {
    isEditableWrapper: true,
  });

  if (rule.fontSize) {
    wrapper.style.setProperty("--custom-font-size", rule.fontSize);
  }

  syncElementMeta(wrapper, meta);

  ensureStylesForElement(wrapper);
  return true;
}

import type { BiliUser, ElementMeta } from "../types";
import type { PageRule } from "@/core/rules/rule-types";
import { StyleScope } from "@/core/rules/rules";
import { resolveRuleTextTarget } from "../dom/text-utils";
import { userStore } from "../store/store";
import { enterEditMode } from "./editor";
import { ensureStylesForElement } from "../style/style-manager";
import { logger } from "@/utils/logger";
import { syncElementMeta, syncRenderedNodeState } from "./rendered-node";
import { markOwnedElement } from "../dom/owned-node";
import { fontSizeCache } from "@/utils/cache";

// 使用 WeakMap 建立 "B站原元素" -> "我们注入的元素" 的映射
const wrapperCache = new WeakMap<HTMLElement, HTMLElement>();

export async function injectMemoRenderer(
  el: HTMLElement,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
): Promise<boolean> {
  const displayMode = userStore.displayMode;

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

function renderMinimal(
  element: HTMLElement | null,
  user: BiliUser,
  meta: ElementMeta,
  displayMode: number,
): boolean {
  if (!element) return false;

  ensureStylesForElement(element);
  syncRenderedNodeState(element, user, meta.originalName, displayMode);
  syncElementMeta(element, meta);

  return true;
}

function renderEditable(
  el: HTMLElement,
  user: BiliUser,
  rule: PageRule,
  meta: ElementMeta,
  displayMode: number,
): boolean {
  let wrapper = wrapperCache.get(el);

  if (
    !wrapper &&
    el.nextElementSibling?.classList.contains("editable-textarea")
  ) {
    wrapper = el.nextElementSibling as HTMLElement;
    wrapperCache.set(el, wrapper);
  }

  if (!wrapper) {
    // 初始化 wrapper（第一次渲染）
    wrapper = markOwnedElement(document.createElement("span"));
    wrapper.classList.add("editable-textarea");
    wrapper.setAttribute("data-bili-processed", "true");
    if(__IS_DEBUG__){
      wrapper.style.position = "relative";
      wrapper.style.zIndex = "10000";
    }
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

    // 插入 DOM（非调试模式隐藏原元素）
    if (!__IS_DEBUG__)
      el.style.display = "none";
    el.insertAdjacentElement("afterend", wrapper);

    // 存入缓存
    wrapperCache.set(el, wrapper);
  }

  // 更新数据

  syncRenderedNodeState(wrapper, user, meta.originalName, displayMode, {
    isEditableWrapper: true,
  });

  const detectedSize = fontSizeCache.getOrDetect(el, rule);
  if (detectedSize) {
    wrapper.style.setProperty("--auto-detected-font-size", detectedSize);
  }

  syncElementMeta(wrapper, meta);

  ensureStylesForElement(wrapper);
  return true;
}

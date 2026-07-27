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
import Alpine from "alpinejs";

// 使用 WeakMap 建立 "B站原元素" -> "我们注入的元素" 的映射
const wrapperCache = new WeakMap<HTMLElement, HTMLElement>();

const middleClickBound = new WeakSet<HTMLElement>();

function openMemoDetailDialog(uid: string) {
  try {
    (Alpine.store("memoDetailDialog") as { open?: (uid: string) => void })?.open?.(uid);
  } catch {
    logger.debug("[renderer] 无法打开详细备注对话框");
  }
}

let showOriginalInDebug = false;
const trackedOriginalElements = new Set<HTMLElement>();

export function setShowOriginalInDebug(value: boolean) {
  showOriginalInDebug = value;
  trackedOriginalElements.forEach((el) => {
    el.style.display = value ? "" : "none";
  });
}

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

  if (user.memo && !middleClickBound.has(element)) {
    middleClickBound.add(element);
    element.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const uid = (e.currentTarget as HTMLElement)?.dataset.bilimemoUid;
      if (!uid) return;
      e.preventDefault();
      openMemoDetailDialog(uid);
    });
  }

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
    if(__IS_DEBUG__){
      wrapper.style.position = "relative";
      wrapper.style.zIndex = "10000";
    }
    wrapper.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      const uid = wrapper?.dataset.bilimemoUid;
      const originalName = wrapper?.dataset.bilimemoOriginal || meta.originalName;
      if (!uid) return;

      // 每次点击都从 store 取最新用户，避免闭包捕获旧对象导致编辑值回退
      const latestUser = userStore.ensureUser(uid, originalName);
      enterEditMode(wrapper!, latestUser);
    });

    wrapper.addEventListener("contextmenu", (e) => {
      const currentHref = (el as HTMLAnchorElement).href;
      if (currentHref?.includes("/list/")) {
        e.preventDefault();
        e.stopPropagation();
        window.open(currentHref, "_blank");
      }
    });

    wrapper.addEventListener("mousedown", (e: MouseEvent) => {
      if (e.button !== 1) return;
      const uid = wrapper?.dataset.bilimemoUid;
      if (!uid) return;
      const currentUser = userStore.ensureUser(uid, "");
      if (!currentUser?.memo) return;
      e.preventDefault();
      openMemoDetailDialog(uid);
    });

    // 插入 DOM（非调试模式隐藏原元素）
    if (!__IS_DEBUG__ || !showOriginalInDebug)
      el.style.display = "none";
    trackedOriginalElements.add(el);
    el.insertAdjacentElement("afterend", wrapper);

    // 存入缓存
    wrapperCache.set(el, wrapper);
  }

  const currentHref = (el as HTMLAnchorElement).href;
  if (currentHref?.includes("/list/")) {
    wrapper.title = el.title ? `${el.title}\n发现注销用户！右键可跳转` : "发现注销用户！右键可跳转";
    wrapper.style.cursor = "pointer";
  } else {
    wrapper.title = "";
    wrapper.style.cursor = "";
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

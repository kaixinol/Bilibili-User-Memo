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

/**
 * 元素内部是否已有非空文字选区（用户正在/刚做完拖选，打算自己复制）
 */
function hasTextSelectionInside(element: HTMLElement): boolean {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return false;
  if (!selection.toString().trim()) return false;
  // 允许部分包含：选区从标签内拖到外面（或反过来）时也算「标签里有选中文字」
  // 注意：双击选词救不了 —— 第一下 click 时选区还没产生，那时已经进编辑态了
  return selection.containsNode(element, true);
}

function openMemoDetailDialog(uid: string) {
  // 之前这里是用 try/catch 兜住的，store 没注册时也会静默失败，看不出来是哪个环节断了
  const dialog = Alpine.store("memoDetailDialog") as
    | { open?: (uid: string) => Promise<void> }
    | undefined;

  if (!dialog?.open) {
    logger.warn("[renderer] 详细备注对话框未注册，无法打开");
    return;
  }

  void dialog.open(uid).catch((error) => {
    logger.warn("[renderer] 打开详细备注对话框失败", error);
  });
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
      // 按住 Alt、或标签内已有选中文字时都不进入编辑态：
      // 留给用户自己选中复制，避免弹出 input 顶掉选区
      if (e.altKey || hasTextSelectionInside(wrapper!)) return;
      e.preventDefault();
      const uid = wrapper?.dataset.bilimemoUid;
      const originalName = wrapper?.dataset.bilimemoOriginal || meta.originalName;
      if (!uid) return;

      // 每次点击都从 store 取最新用户，避免闭包捕获旧对象导致编辑值回退
      const latestUser = userStore.getUserOrPlaceholder(uid, originalName);
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
      const currentUser = userStore.getUserOrPlaceholder(uid, "");
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
  const isDeleted = currentHref?.includes("/list/");
  const hasNoVideo = el.title.includes("没有任何视频投稿");

  if (isDeleted && !hasNoVideo) {
    wrapper.title = el.title ? `${el.title}\n发现注销用户！右键可跳转` : "发现注销用户！右键可跳转";
    wrapper.style.cursor = "pointer";
  } else if (isDeleted && hasNoVideo) {
    wrapper.title = el.title;
    wrapper.style.cursor = "not-allowed";
  } else {
    wrapper.title = el.title;
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

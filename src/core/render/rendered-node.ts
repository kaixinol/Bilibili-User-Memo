import type { BiliUser, ElementMeta } from "../types";
import { formatDisplayName } from "../dom/text-utils";
import { trackRenderedElement } from "./render-index";
import { logger } from "@/utils/logger";

interface RenderedNodeOptions {
  isEditableWrapper?: boolean;
  /** 只替换直接子文本节点，保留子元素（SVG/图标等）。 */
  directText?: boolean;
}

const MEMO_DETAIL_LABEL = "详细备注：";

/**
 * 剥掉我们追加的详细备注段。标题可能已被 B 站或其他逻辑改写，
 * 因此按「值是否变化」重算，而不是按「标记是否已存在」跳过。
 */
function stripMemoDetail(title: string): string {
  return title.replace(/\n?详细备注：[\s\S]*$/, "").trim();
}

function buildTitle(base: string, detail: string): string {
  if (!detail) return base;
  return base ? `${base}\n${MEMO_DETAIL_LABEL}${detail}` : `${MEMO_DETAIL_LABEL}${detail}`;
}

function getDirectTextNodes(el: HTMLElement): Text[] {
  const nodes: Text[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text);
  }
  return nodes;
}

function getDirectText(el: HTMLElement): string {
  return getDirectTextNodes(el)
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();
}

/** 只替换直接子文本节点，保留子元素（SVG 等）。与 directText 提取对称。 */
function setDirectText(el: HTMLElement, text: string): boolean {
  const nodes = getDirectTextNodes(el);
  if (nodes.length === 0) return false;
  nodes[0].textContent = text;
  for (let i = 1; i < nodes.length; i++) nodes[i].remove();
  return true;
}

/**
 * 整段 textContent 赋值会移除所有子节点。命中带元素子节点（如等级徽章 SVG）的元素时
 * 这是破坏性的——告警提示该规则可能需要改用 directText。
 */
function warnIfClobbersChildren(el: HTMLElement, text: string) {
  const children = Array.from(el.children ?? []);
  if (children.length === 0) return;
  // 记快照（标签名/outerHTML 字符串）而非活的 element 引用：赋值后子元素已被销毁，
  // console 展开活引用只会看到「svg 已没了」的状态，看不到触发时到底要吞掉什么
  logger.warn(
    "[rendered-node] textContent 赋值将移除子元素，该规则可能需要 directText",
    {
      childTags: children.map((c) => c.tagName.toLowerCase()),
      elementSnippet: el.outerHTML?.slice(0, 160) ?? "",
      text,
    },
  );
}

export function syncRenderedNodeState(
  el: HTMLElement,
  user: BiliUser | undefined,
  originalName: string,
  displayMode: number,
  options: RenderedNodeOptions = {},
) {
  const text = formatDisplayName(user, originalName, displayMode);
  if (options.directText && getDirectTextNodes(el).length > 0) {
    if (getDirectText(el) !== text) {
      setDirectText(el, text);
    }
  } else if (el.textContent !== text) {
    warnIfClobbersChildren(el, text);
    el.textContent = text;
  }

  const isMemoTag = Boolean(
    !options.isEditableWrapper &&
    user?.memo &&
    user.memo !== originalName &&
    text !== originalName,
  );
  el.classList.toggle("bili-memo-tag", isMemoTag);

  // 同步详细备注 title
  const nextDetail = user?.memoDetail?.trim() ?? "";
  const nextTitle = buildTitle(stripMemoDetail(el.title ?? ""), nextDetail);
  if (el.title !== nextTitle) {
    el.title = nextTitle;
  }
}

export function syncElementMeta(el: HTMLElement, meta: ElementMeta) {
  if (el.dataset.bilimemoUid !== meta.uid) {
    el.dataset.bilimemoUid = meta.uid;
    trackRenderedElement(el, meta.uid);
  }
  if (el.dataset.bilimemoOriginal !== meta.originalName) {
    el.dataset.bilimemoOriginal = meta.originalName;
  }
}

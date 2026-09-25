import type { BiliUser, ElementMeta } from "../types";
import { formatDisplayName } from "../dom/text-utils";
import { trackRenderedElement } from "./render-index";

interface RenderedNodeOptions {
  isEditableWrapper?: boolean;
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

export function syncRenderedNodeState(
  el: HTMLElement,
  user: BiliUser | undefined,
  originalName: string,
  displayMode: number,
  options: RenderedNodeOptions = {},
) {
  const text = formatDisplayName(user, originalName, displayMode);
  if (el.textContent !== text) {
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

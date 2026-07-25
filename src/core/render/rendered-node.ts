import type { BiliUser, ElementMeta } from "../types";
import { formatDisplayName } from "../dom/text-utils";
import { trackRenderedElement } from "./render-index";

interface RenderedNodeOptions {
  isEditableWrapper?: boolean;
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

  const shouldHighlight = Boolean(
    !options.isEditableWrapper &&
    user?.memo &&
    user.memo !== originalName &&
    text !== originalName,
  );
  el.classList.toggle("bili-memo-tag", shouldHighlight);

  // 同步详细备注 title
  if (user?.memoDetail) {
    if (!el.title?.includes("详细备注：")) {
      el.title = el.title
        ?       `${el.title}\n详细备注：${user.memoDetail}`
        : `详细备注：${user.memoDetail}`;
    }
  } else if (el.title?.includes("详细备注：")) {
    el.title = el.title.replace(/\n详细备注：.*/, "").trim();
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

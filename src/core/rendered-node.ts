import { BiliUser, ElementMeta } from "./types";
import { formatDisplayName } from "./dom-utils";

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
}

export function syncElementMeta(el: HTMLElement, meta: ElementMeta) {
  if (el.dataset.biliUid !== meta.uid) {
    el.dataset.biliUid = meta.uid;
  }
  if (el.dataset.biliOriginal !== meta.originalName) {
    el.dataset.biliOriginal = meta.originalName;
  }
}

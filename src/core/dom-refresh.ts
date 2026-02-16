import { querySelectorAllDeep } from "query-selector-shadow-dom";
import { BiliUser } from "./types";
import { syncRenderedNodeState } from "./rendered-node";

export function refreshRenderedMemoNodes(
  users: BiliUser[],
  displayMode: number,
  changedIds?: string[],
) {
  const changed = changedIds && changedIds.length > 0 ? new Set(changedIds) : null;
  const userMap = new Map(users.map((u) => [u.id, u]));
  const allTags = querySelectorAllDeep(`[data-bili-uid]`);

  allTags.forEach((tag) => {
    const uid = tag.getAttribute("data-bili-uid");
    if (!uid) return;
    if (changed && !changed.has(uid)) return;

    const originalName = tag.getAttribute("data-bili-original") || "";
    const user = userMap.get(uid);
    syncRenderedNodeState(tag, user, originalName, displayMode, {
      isEditableWrapper: tag.classList.contains("editable-textarea"),
    });
  });
}

import type { BiliUser } from "../types";
import { syncRenderedNodeState } from "./rendered-node";
import {
  getAllTrackedEntries,
  getTrackedElementsForIds,
} from "./render-index";

function refreshTag(
  tag: HTMLElement,
  user: BiliUser | undefined,
  displayMode: number,
) {
  const originalName = tag.dataset.bilimemoOriginal || "";
  syncRenderedNodeState(tag, user, originalName, displayMode, {
    isEditableWrapper: tag.classList.contains("editable-textarea"),
  });
}

export function refreshRenderedMemoNodes(
  users: readonly BiliUser[],
  displayMode: number,
  changedIds?: string[],
) {
  if (changedIds && changedIds.length > 0) {
    const uniqueIds = Array.from(new Set(changedIds.filter(Boolean)));
    const userMap = new Map<string, BiliUser>();
    users.forEach((user) => {
      if (uniqueIds.includes(user.id)) {
        userMap.set(user.id, user);
      }
    });

    const uidTagMap = getTrackedElementsForIds(uniqueIds);
    uniqueIds.forEach((uid) => {
      const tags = uidTagMap.get(uid) || [];
      const user = userMap.get(uid);
      tags.forEach((tag) => refreshTag(tag, user, displayMode));
    });
    return;
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const entries = getAllTrackedEntries();
  entries.forEach(([uid, tags]) => {
    const user = userMap.get(uid);
    tags.forEach((tag) => refreshTag(tag, user, displayMode));
  });
}

import { querySelectorAllDeep } from "@/utils/query-dom";
import type { BiliUser } from "../types";
import { syncRenderedNodeState } from "./rendered-node";

function refreshTag(
  tag: HTMLElement,
  user: BiliUser | undefined,
  displayMode: number,
) {
  const originalName = tag.getAttribute("data-bilimemo-original") || "";
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
    const targetIdSet = new Set(uniqueIds);
    const userMap = new Map<string, BiliUser>();
    users.forEach((user) => {
      if (targetIdSet.has(user.id)) {
        userMap.set(user.id, user);
      }
    });

    const allTags = querySelectorAllDeep(`[data-bilimemo-uid]`, document);
    const uidTagMap = new Map<string, HTMLElement[]>();
    allTags.forEach((tag) => {
      const uid = tag.getAttribute("data-bilimemo-uid");
      if (uid && targetIdSet.has(uid)) {
        let arr = uidTagMap.get(uid);
        if (!arr) { arr = []; uidTagMap.set(uid, arr); }
        arr.push(tag);
      }
    });
    uniqueIds.forEach((uid) => {
      const tags = uidTagMap.get(uid) || [];
      const user = userMap.get(uid);
      tags.forEach((tag) => refreshTag(tag, user, displayMode));
    });
    return;
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const allTags = querySelectorAllDeep(`[data-bilimemo-uid]`, document);
  allTags.forEach((tag) => {
    const uid = tag.getAttribute("data-bilimemo-uid");
    if (!uid) return;
    refreshTag(tag, userMap.get(uid), displayMode);
  });
}

import { querySelectorAllDeep } from "@/utils/query-dom";
import type { BiliUser } from "../types";
import { syncRenderedNodeState } from "./rendered-node";

function escapeAttrValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  // Fallback: enough for attribute selector usage in older environments
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function refreshTag(
  tag: HTMLElement,
  user: BiliUser | undefined,
  displayMode: number,
) {
  const originalName = tag.getAttribute("data-bili-original") || "";
  syncRenderedNodeState(tag, user, originalName, displayMode, {
    isEditableWrapper: tag.classList.contains("editable-textarea"),
  });
}

export function refreshRenderedMemoNodes(
  users: BiliUser[],
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
    uniqueIds.forEach((uid) => {
      const selector = `[data-bili-uid="${escapeAttrValue(uid)}"]`;
      const tags = querySelectorAllDeep(selector);
      const user = userMap.get(uid);
      tags.forEach((tag) => refreshTag(tag, user, displayMode));
    });
    return;
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const allTags = querySelectorAllDeep(`[data-bili-uid]`);
  allTags.forEach((tag) => {
    const uid = tag.getAttribute("data-bili-uid");
    if (!uid) return;
    refreshTag(tag, userMap.get(uid), displayMode);
  });
}

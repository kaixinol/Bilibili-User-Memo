import type { BiliUser } from "../types";
import { syncRenderedNodeState } from "./rendered-node";
import {
  getAllTrackedEntries,
  getTrackedElementsForIds,
} from "./render-index";

function refreshRenderedNode(
  node: HTMLElement,
  user: BiliUser | undefined,
  displayMode: number,
) {
  const originalName = node.dataset.bilimemoOriginal || "";
  syncRenderedNodeState(node, user, originalName, displayMode, {
    isEditableWrapper: node.classList.contains("editable-textarea"),
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

    const uidNodeMap = getTrackedElementsForIds(uniqueIds);
    uniqueIds.forEach((uid) => {
      const nodes = uidNodeMap.get(uid) || [];
      const user = userMap.get(uid);
      nodes.forEach((node) => refreshRenderedNode(node, user, displayMode));
    });
    return;
  }

  const userMap = new Map(users.map((u) => [u.id, u]));
  const entries = getAllTrackedEntries();
  entries.forEach(([uid, nodes]) => {
    const user = userMap.get(uid);
    nodes.forEach((node) => refreshRenderedNode(node, user, displayMode));
  });
}

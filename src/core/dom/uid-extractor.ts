import { unsafeWindow } from "$";
import { logger } from "../../utils/logger";

const DIRECT_UID_ATTRS = ["data-user-profile-id", "bilisponsor-userid"] as const;
const DYNAMIC_ITEM_SELECTOR = "div.bili-dyn-item__main";
const SPACE_UID_REGEX = /space\.bilibili\.com\/(\d+)/;

function normalizeUid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const uid = String(value).trim();
  return uid.length > 0 ? uid : null;
}

function getAttr(el: Element, name: string): string | null {
  return normalizeUid(el.getAttribute(name));
}

function getAttrFromQuery(
  root: ParentNode,
  selector: string,
  attribute: string,
): string | null {
  const target = root.querySelector(selector);
  if (!target) return null;
  return normalizeUid(target.getAttribute(attribute));
}

function getFirstAttr(el: Element, names: readonly string[]): string | null {
  for (const name of names) {
    const value = getAttr(el, name);
    if (value) return value;
  }
  return null;
}

function parseUidFromDataId(value: string | null): string | null {
  if (!value) return null;
  return normalizeUid(value.split("_")[1]);
}

function readUidFromOwnAttributes(el: Element): string | null {
  return (
    getAttr(el, "data-bili-uid") ||
    parseUidFromDataId(getAttr(el, "data-id")) ||
    getFirstAttr(el, DIRECT_UID_ATTRS)
  );
}

function readUidFromDynamicItemRoot(el: Element): string | null {
  const root = el.closest(DYNAMIC_ITEM_SELECTOR);
  if (!root) return null;

  return (
    getAttrFromQuery(root, "[bilisponsor-userid]", "bilisponsor-userid") ||
    getAttrFromQuery(root, "[data-user-profile-id]", "data-user-profile-id") ||
    parseUidFromDataId(
      getAttrFromQuery(root, "[data-id]", "data-id"),
    )
  );
}

function readUidFromHrefOrLocation(el: Element): string | null {
  const href = el.getAttribute("href") || location.href;
  if (!href) return null;
  const match = href.match(SPACE_UID_REGEX);
  return normalizeUid(match?.[1]);
}

type InitialState = {
  detail?: {
    basic?: { uid?: unknown };
    modules?: Array<{ module_author?: { mid?: unknown } }>;
  };
};

type UidStrategy = (el: Element) => string | null;

function readUidFromInitialState(): string | null {
  const initialState = (unsafeWindow as { __INITIAL_STATE__?: InitialState })
    .__INITIAL_STATE__;
  return (
    normalizeUid(initialState?.detail?.basic?.uid) ||
    normalizeUid(
      initialState?.detail?.modules?.find((module) => module.module_author)
        ?.module_author?.mid,
    )
  );
}

const UID_STRATEGIES: readonly UidStrategy[] = [
  readUidFromOwnAttributes,
  readUidFromDynamicItemRoot,
  readUidFromHrefOrLocation,
  () => readUidFromInitialState(),
];

/**
 * 尝试从 DOM 元素中提取 B站 UID。
 * @param el 目标元素
 * @param silent 为 true 时，找不到 UID 不输出警告（用于启用 matchByName 的规则）
 */
export function extractUid(el: Element, silent = false): string | null {
  for (const strategy of UID_STRATEGIES) {
    const uid = strategy(el);
    if (uid) return uid;
  }

  if (!silent) {
    logger.warn("⚠️ 无法从元素中提取 UID:", el);
  }
  return null;
}

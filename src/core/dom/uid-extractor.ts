import { logger } from "@/utils/logger.ts";

const DIRECT_UID_ATTRS = [
  "data-user-profile-id",
  "bilisponsor-userid",
  "data-oid",
] as const;
const DYNAMIC_ITEM_SELECTOR = "div.bili-dyn-item__main";
const SPACE_UID_REGEX = /(?:space\.bilibili\.com|www\.bilibili\.com\/list)\/(\d+)/;

/**
 * 检查 URL 是否为已注销用户的 B站 空间
 * 格式: www.bilibili.com/list/xxx
 */
export function isDeletedUserSpace(url: string): boolean {
  return /:\/\/(?:www\.)?bilibili\.com\/list\/\d+/.test(url);
}

function normalizeUid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const uid = String(value).trim();
  return uid.length > 0 ? uid : null;
}

export function getUidFromVueInstance(el: HTMLElement | null | undefined): string | null {
  return normalizeUid(el?.__vue__?.author?.mid);
}

export function getOpusAuthorUid(el: Element | null | undefined): string | null {
  return (
    normalizeUid(window.__INITIAL_STATE__?.detail?.basic?.uid) ||
    normalizeUid(
      window.__INITIAL_STATE__?.detail?.modules?.find((module) => module.module_author)
        ?.module_author?.mid,
    ) ||
    normalizeUid((el as any)?.$log?.click?.value?.mid)
  );
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
    parseUidFromDataId(getAttr(el, "data-id")) ||
    getFirstAttr(el, DIRECT_UID_ATTRS)
  );
}

function readUidFromDynamicItemRoot(el: Element): string | null {
  const root = el.closest(DYNAMIC_ITEM_SELECTOR);
  if (!root) return null;

  return (
    getAttrFromQuery(root, "[bilisponsor-userid]", "bilisponsor-userid") ||
    getAttrFromQuery(root.parentElement!, "[data-user-profile-id]", "data-user-profile-id") ||
    parseUidFromDataId(
      getAttrFromQuery(root, "[data-id]", "data-id"),
    )
  );
}

function readUidFromHref(el: Element): string | null {
  const href = el.getAttribute("href");
  if (!href) return null;
  const match = href.match(SPACE_UID_REGEX);
  return normalizeUid(match?.[1]);
}

type UidStrategy = (el: Element) => string | null;

const UID_STRATEGIES_WITHOUT_LOCATION: readonly UidStrategy[] = [
  readUidFromOwnAttributes,
  readUidFromDynamicItemRoot,
  readUidFromHref,
];

const UID_STRATEGIES: readonly UidStrategy[] = [
  ...UID_STRATEGIES_WITHOUT_LOCATION,
  () => {
    const match = location.href.match(SPACE_UID_REGEX);
    return normalizeUid(match?.[1]);
  },
];

interface ExtractUidOptions {
  silent?: boolean;
  allowLocationFallback?: boolean;
}

/**
 * 尝试从 DOM 元素中提取 B站 UID。
 * @param el 目标元素
 * @param options
 * @param options.silent 为 true 时，找不到 UID 不输出警告（用于启用 matchByName 的规则）
 * @param options.allowLocationFallback 为 false 时，不从当前页面 URL 兜底取 UID
 */
export function extractUid(
  el: Element,
  options: boolean | ExtractUidOptions = false,
): string | null {
  const normalizedOptions =
    typeof options === "boolean" ? { silent: options } : options;
  const strategies = normalizedOptions.allowLocationFallback === false
    ? UID_STRATEGIES_WITHOUT_LOCATION
    : UID_STRATEGIES;

  for (const strategy of strategies) {
    const uid = strategy(el);
    if (uid) return uid;
  }

  if (!normalizedOptions.silent) {
    logger.warn("⚠️ 无法从元素中提取 UID:", el);
  }
  return null;
}

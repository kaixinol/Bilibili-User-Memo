/**
 * UID 提取工具。
 *
 * ⚠️ 本模块为脚本内部实现细节：所有函数（含导出函数）均非稳定公共 API，
 * 仅供脚本内部规则/注入逻辑使用；外部调用需自行校验目标页面的 DOM 假设。
 */

import { logger } from "@/utils/logger.ts";

const DIRECT_UID_ATTRS = [
  "data-user-profile-id",
  "bilisponsor-userid",
  "data-oid",
] as const;
const DYNAMIC_ITEM_SELECTOR = "div.bili-dyn-item__main";
export const SPACE_UID_REGEX = /(?:space\.bilibili\.com|www\.bilibili\.com\/list)\/(\d+)/;

function _normalizeUid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const uid = String(value).trim();
  return uid.length > 0 ? uid : null;
}

/**
 * 从 Vue 实例提取条目作者 UID（内部 API，非稳定公共接口）。
 *
 * ⚠️ 依赖 `el.__vue__.author.mid`，仅当元素位于 Vue 渲染的动态条目内且属性存在时有效；
 * 调用前请确认元素非空且属于条目级元素，避免拿到错误上下文。
 */
export function getUidFromVueInstance(el: HTMLElement | null | undefined): string | null {
  return _normalizeUid(el?.__vue__?.author?.mid);
}

/**
 * 提取「被转发的视频/动态」原作者 UID（内部 API，非稳定公共接口）。
 *
 * ⚠️ 依赖 `window.__INITIAL_STATE__.detail.*`（opus 页）、`el.$log.click.value.author_mid`、
 * `el._profile.uid`，这些来源仅在特定渲染路径下存在，缺失时结果不可靠（可能回落错误来源）。
 * 仅用于能确定元素属于「被嵌套原作者」的上下文（如规则 uidResolver）。
 */
export function getOpusAuthorUid(el: Element | null | undefined): string | null {
  return (
    _normalizeUid(window.__INITIAL_STATE__?.detail?.basic?.uid) ||
    _normalizeUid(
      window.__INITIAL_STATE__?.detail?.modules?.find((module) => module.module_author)
        ?.module_author?.mid,
    ) ||
    _normalizeUid((el as any)?.$log?.click?.value?.author_mid)
    ||
    _normalizeUid((el as any)?._profile.uid)
  );
}

function _getAttr(el: Element, name: string): string | null {
  return _normalizeUid(el.getAttribute(name));
}

function _getAttrFromQuery(
  root: ParentNode,
  selector: string,
  attribute: string,
): string | null {
  const target = root.querySelector(selector);
  if (!target) return null;
  return _normalizeUid(target.getAttribute(attribute));
}

function _getFirstAttr(el: Element, names: readonly string[]): string | null {
  for (const name of names) {
    const value = _getAttr(el, name);
    if (value) return value;
  }
  return null;
}

function _parseUidFromDataId(value: string | null): string | null {
  if (!value) return null;
  return _normalizeUid(value.split("_")[1]);
}

function _readUidFromOwnAttributes(el: Element): string | null {
  return (
    _parseUidFromDataId(_getAttr(el, "data-id")) ||
    _getFirstAttr(el, DIRECT_UID_ATTRS)
  );
}

function _readUidFromDynamicItemRoot(el: Element): string | null {
  const root = el.closest(DYNAMIC_ITEM_SELECTOR);
  if (!root) return null;

  return (
    _getAttrFromQuery(root, "[bilisponsor-userid]", "bilisponsor-userid") ||
    _getAttrFromQuery(root.parentElement!, "[data-user-profile-id]", "data-user-profile-id") ||
    _parseUidFromDataId(
      _getAttrFromQuery(root, "[data-id]", "data-id"),
    )
  );
}

function _readUidFromHref(el: Element): string | null {
  const href = el.getAttribute("href");
  if (!href) return null;
  const match = href.match(SPACE_UID_REGEX);
  return _normalizeUid(match?.[1]);
}

type UidStrategy = (el: Element) => string | null;

const _UID_STRATEGIES_WITHOUT_LOCATION: readonly UidStrategy[] = [
  _readUidFromOwnAttributes,
  _readUidFromHref,
  _readUidFromDynamicItemRoot,
];

const _UID_STRATEGIES: readonly UidStrategy[] = [
  ..._UID_STRATEGIES_WITHOUT_LOCATION,
  () => {
    const match = location.href.match(SPACE_UID_REGEX);
    return _normalizeUid(match?.[1]);
  },
];

interface ExtractUidOptions {
  silent?: boolean;
  allowLocationFallback?: boolean;
}

/**
 * 尝试从 DOM 元素中提取 B站 UID（内部 API，非稳定公共接口）。
 *
 * ⚠️ 警告：
 * 1. 内部 `_readUidFromDynamicItemRoot` 会在整条 `div.bili-dyn-item__main` 内搜索
 *    `[bilisponsor-userid]` / `[data-user-profile-id]` / `[data-id]`，返回的是
 *    「条目主人」的 UID。对转发内容中的原作者等**嵌套元素**，结果会错误命中条目主人
 *    （用户空间动态-转发 串号 bug 的根源）。
 * 2. `allowLocationFallback`（默认 true）会用当前页面 URL 的 space UID 兜底，
 *    仅当目标元素确实属于该 URL 用户时才可靠。
 * 3. 对定义了 `uidResolver` 的规则，不要用本函数做 skip-check/预解析，
 *    必须使用规则自身的解析链（如 injector 的 `resolveElementUid`），否则会与
 *    渲染时的 UID 不一致，导致错误覆盖正确标注。
 *
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
    ? _UID_STRATEGIES_WITHOUT_LOCATION
    : _UID_STRATEGIES;

  for (const strategy of strategies) {
    const uid = strategy(el);
    if (uid) return uid;
  }

  if (!normalizedOptions.silent) {
    logger.warn("⚠️ 无法从元素中提取 UID:", el);
  }
  return null;
}

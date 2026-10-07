/**
 * 内存索引：UID → 渲染元素集合
 *
 * 用于 dom-refresh.ts 替代 querySelectorAllDeep('[data-bilimemo-uid]', document)
 * 将 O(totalDOM) 全量遍历降为 O(trackedElements) 索引查找。
 *
 * 写入点：syncElementMeta() — 设置 data-bilimemo-uid 时
 */

const uidElementMap = new Map<string, Set<HTMLElement>>();
const elementUidMap = new WeakMap<HTMLElement, string>();
// 记录元素是否用 directText 渲染（只替换直接子文本节点，保留 SVG 等子元素）。
// 刷新路径（dom-refresh）拿不到 rule，靠这里把该 bit 带到 refresh，避免退回 textContent 吞子元素。
const elementDirectTextMap = new WeakMap<HTMLElement, boolean>();

/**
 * 追踪已渲染元素。在 syncElementMeta 设置 UID 时调用。
 * 自动处理 UID 变更（先移除旧 UID 再添加新 UID）。
 */
export function trackRenderedElement(el: HTMLElement, uid: string): void {
  const oldUid = elementUidMap.get(el);
  if (oldUid === uid) return;

  // 移除旧 UID 索引
  if (oldUid) {
    const oldSet = uidElementMap.get(oldUid);
    if (oldSet) {
      oldSet.delete(el);
      if (oldSet.size === 0) uidElementMap.delete(oldUid);
    }
  }

  // 添加新 UID 索引
  let set = uidElementMap.get(uid);
  if (!set) {
    set = new Set();
    uidElementMap.set(uid, set);
  }
  set.add(el);
  elementUidMap.set(el, uid);
}

/** 标记元素是否用 directText 渲染，供刷新路径读取。false 时清除标记。 */
export function setElementDirectText(el: HTMLElement, directText: boolean): void {
  if (directText) {
    elementDirectTextMap.set(el, true);
  } else {
    elementDirectTextMap.delete(el);
  }
}

/** 读取元素的 directText 渲染标记。 */
export function isElementDirectText(el: HTMLElement): boolean {
  return elementDirectTextMap.get(el) === true;
}

/**
 * 获取指定 UID 的已连接渲染元素。
 * 自动清理已断开连接的元素。
 */
function getTrackedElements(uid: string): HTMLElement[] {
  const set = uidElementMap.get(uid);
  if (!set) return [];

  const result: HTMLElement[] = [];
  for (const el of set) {
    if (el.isConnected) {
      result.push(el);
    } else {
      set.delete(el);
      elementUidMap.delete(el);
    }
  }
  if (set.size === 0) {
    uidElementMap.delete(uid);
  }
  return result;
}

/**
 * 批量获取多个 UID 的渲染元素。返回 uid → elements 映射。
 * 仅包含有元素的 UID。
 */
export function getTrackedElementsForIds(
  uids: readonly string[],
): Map<string, HTMLElement[]> {
  const result = new Map<string, HTMLElement[]>();
  for (const uid of uids) {
    const elements = getTrackedElements(uid);
    if (elements.length > 0) {
      result.set(uid, elements);
    }
  }
  return result;
}

/**
 * 遍历所有已追踪的 UID 并清理断开连接的元素。
 * 返回仍有效的 [uid, elements] 对。
 */
export function getAllTrackedEntries(): [string, HTMLElement[]][] {
  const entries: [string, HTMLElement[]][] = [];
  for (const [uid, set] of uidElementMap) {
    const connected: HTMLElement[] = [];
    for (const el of set) {
      if (el.isConnected) {
        connected.push(el);
      } else {
        set.delete(el);
        elementUidMap.delete(el);
      }
    }
    if (connected.length === 0) {
      uidElementMap.delete(uid);
    } else {
      entries.push([uid, connected]);
    }
  }
  return entries;
}

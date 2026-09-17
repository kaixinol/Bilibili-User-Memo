import Alpine from "alpinejs";
import { GM_deleteValue, GM_getValue, GM_setValue } from "$";

export function getGmValue<T>(key: string, fallback: T): T {
  return GM_getValue<T>(key, fallback);
}

export function setGmValue<T>(key: string, value: T): void {
  GM_setValue(key, value);
}

/**
 * GM 存储与 localStorage 契约不同：GM_getValue / GM_setValue 直接读写结构化值，
 * 而 $persist 要求 getItem 返回字符串、setItem 接收字符串，所以这层 JSON round-trip 是必需的桥。
 *
 * 历史数据兼容：round-trip 自身是幂等的，无论 GM 里存的是裸值还是对象都能原样取回。
 * 只有当某个持久化值「本身是字符串、且内容恰好构成合法 JSON 字面量」时才会出现歧义，
 * 而本项目全部持久化字段（"UvU" / "UwU" / 布尔 / 颜色串 / CSS 串）都不满足该条件。
 */
const gmStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
} = {
  getItem(key) {
    const stored = GM_getValue<unknown>(key);
    return stored === undefined ? null : JSON.stringify(stored);
  },
  setItem(key, value) {
    GM_setValue(key, JSON.parse(value) as unknown);
  },
  removeItem(key) {
    GM_deleteValue(key);
  },
};

/**
 * 持久化到 GM 存储，替代原先直接调 `Alpine.interceptor` 的写法
 * （interceptor 在 Alpine 源码里被标注为非公开 API，不受 semver 保护）。
 *
 * 必须在 `Alpine.plugin(persist)` 之后调用；Alpine.plugin 是同步注册的，见 main.ts。
 */
export function persistWithGmStorage<T>(key: string, initialValue: T): T {
  return Alpine.$persist(initialValue).as(key).using(gmStorage) as T;
}

const PRELOAD_ALL_CARDS_KEY = "panelPreloadAllCards";
const SILENT_AVATAR_UPDATE_KEY = "panelSilentAvatarUpdate";

export function getPanelPreloadAllCards(): boolean {
  return getGmValue<boolean>(PRELOAD_ALL_CARDS_KEY, true);
}

export function setPanelPreloadAllCards(value: boolean) {
  setGmValue(PRELOAD_ALL_CARDS_KEY, value);
}

export function getSilentAvatarUpdate(): boolean {
  return getGmValue<boolean>(SILENT_AVATAR_UPDATE_KEY, false);
}

export function setSilentAvatarUpdate(value: boolean) {
  setGmValue(SILENT_AVATAR_UPDATE_KEY, value);
}

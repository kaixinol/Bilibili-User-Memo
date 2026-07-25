import { GM_getValue, GM_setValue } from "$";

export interface PersistStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function getGmValue<T>(key: string, fallback: T): T {
  return GM_getValue<T>(key, fallback);
}

export function setGmValue<T>(key: string, value: T): void {
  GM_setValue(key, value);
}

export function createPrefixedGmStorage(
  prefix: string,
  emptyValue = "",
): PersistStorage {
  return {
    getItem(storageKey) {
      const value = getGmValue<string>(`${prefix}${storageKey}`, emptyValue);
      return value || null;
    },
    setItem(storageKey, value) {
      setGmValue(`${prefix}${storageKey}`, value);
    },
    removeItem(storageKey) {
      setGmValue(`${prefix}${storageKey}`, emptyValue);
    },
  };
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

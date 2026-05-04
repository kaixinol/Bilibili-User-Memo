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

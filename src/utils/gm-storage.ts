import Alpine from "alpinejs";
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

const gmStorage: PersistStorage = {
  getItem(key) {
    const value = GM_getValue<string | null>(key, null);
    return value ?? null;
  },
  setItem(key, value) {
    GM_setValue(key, value);
  },
  removeItem(key) {
    GM_setValue(key, null);
  },
};

interface PersistInterceptor<T> {
  as(key: string): PersistInterceptor<T>;
  using(storage: PersistStorage): T;
}

export function persistWithGmStorage<T>(key: string, initialValue: T): T {
  const persistFactory = (Alpine as unknown as {
    $persist?: (value: T) => PersistInterceptor<T>;
  }).$persist;

  if (!persistFactory) return initialValue;

  return persistFactory(initialValue).as(key).using(gmStorage);
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

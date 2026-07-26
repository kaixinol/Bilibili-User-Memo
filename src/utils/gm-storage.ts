import Alpine from "alpinejs";
import { GM_getValue, GM_setValue } from "$";

export function getGmValue<T>(key: string, fallback: T): T {
  return GM_getValue<T>(key, fallback);
}

export function setGmValue<T>(key: string, value: T): void {
  GM_setValue(key, value);
}

function persistNative<T>(key: string, initialValue: T) {
  const factory = Alpine.interceptor(
    (initValue, getter, setter) => {
      const stored = GM_getValue<unknown>(key);
      let initial: T;
      if (stored !== undefined && typeof stored === "string") {
        try {
          const parsed = JSON.parse(stored);
          initial = parsed as T;
          GM_setValue(key, initial);
        } catch {
          initial = stored as T;
        }
      } else {
        initial = (stored !== undefined ? stored : initValue) as T;
      }

      setter(initial);

      Alpine.effect(() => {
        GM_setValue(key, getter());
      });

      return initial;
    },
  );

  return factory(initialValue) as Alpine.InterceptorObject<T>;
}

export function persistWithGmStorage<T>(key: string, initialValue: T): T {
  return persistNative(key, initialValue) as T;
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

import Alpine from "alpinejs";
import { GM_getValue, GM_setValue } from "$";

export function getGmValue<T>(key: string, fallback: T): T {
  return GM_getValue<T>(key, fallback);
}

export function setGmValue<T>(key: string, value: T): void {
  GM_setValue(key, value);
}

function persistNative<T>(initialValue: T) {
  let alias: string | undefined;

  const factory = Alpine.interceptor(
    (initValue, getter, setter) => {
      const lookup = alias!;
      const stored = GM_getValue<unknown>(lookup);
      const initial = stored !== undefined ? stored : initValue;

      setter(initial);

      Alpine.effect(() => {
        GM_setValue(lookup, getter());
      });

      return initial;
    },
    (obj) => {
      (obj as unknown as { as(key: string): typeof obj }).as = (key: string) => {
        alias = key;
        return obj;
      };
    },
  );

  return factory(initialValue) as Alpine.InterceptorObject<T> & { as(key: string): unknown };
}

export function persistWithGmStorage<T>(key: string, initialValue: T): T {
  return persistNative(initialValue).as(key) as T;
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

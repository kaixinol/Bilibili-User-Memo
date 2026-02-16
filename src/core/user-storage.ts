import { GM_getValue, GM_setValue } from "$";
import { BiliUser } from "./types";

export const USERS_KEY = "biliUsers";
export const DISPLAY_MODE_KEY = "displayMode";
export const DEFAULT_DISPLAY_MODE = 2;

export function normalizeDisplayMode(value: unknown): number {
  return typeof value === "number" && value >= 0 && value <= 3
    ? value
    : DEFAULT_DISPLAY_MODE;
}

export function normalizeUsers(raw: unknown): BiliUser[] {
  if (!Array.isArray(raw)) return [];

  const cleaned = new Map<string, BiliUser>();
  raw.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const record = entry as Partial<BiliUser>;
    const id = String(record.id || "").trim();
    if (!id) return;

    const memo = String(record.memo || "").trim();
    // 只存储有备注的用户，避免“空备注垃圾记录”膨胀
    if (!memo) return;

    const nickname = String(record.nickname || "").trim() || id;
    const avatar = String(record.avatar || "");

    cleaned.set(id, { id, nickname, avatar, memo });
  });

  return Array.from(cleaned.values());
}

export function loadUsersFromStorage(): {
  raw: unknown;
  users: BiliUser[];
} {
  const raw = GM_getValue<BiliUser[]>(USERS_KEY, []);
  return { raw, users: normalizeUsers(raw) };
}

export function loadDisplayModeFromStorage(): number {
  return normalizeDisplayMode(
    GM_getValue<number>(DISPLAY_MODE_KEY, DEFAULT_DISPLAY_MODE),
  );
}

export function saveUsersToStorage(users: BiliUser[]) {
  GM_setValue(USERS_KEY, users);
}

export function saveDisplayModeToStorage(mode: number) {
  GM_setValue(DISPLAY_MODE_KEY, mode);
}

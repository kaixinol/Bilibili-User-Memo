import type { BiliUser } from "../types";
import { getGmValue, setGmValue } from "../../utils/gm-storage";
import { normalizeUserCollection } from "./user-normalization";

export const USERS_KEY = "biliUsers";
export const DISPLAY_MODE_KEY = "displayMode";
export const DEFAULT_DISPLAY_MODE = 2;

export function normalizeDisplayMode(value: unknown): number {
  return typeof value === "number" && value >= 0 && value <= 3
    ? value
    : DEFAULT_DISPLAY_MODE;
}

export function normalizeUsers(raw: unknown): BiliUser[] {
  return normalizeUserCollection(raw, {
    requireMemo: true,
    fallbackNicknameToId: true,
  });
}

export function loadUsersFromStorage(): {
  raw: unknown;
  users: BiliUser[];
} {
  const raw = getGmValue<BiliUser[]>(USERS_KEY, []);
  return { raw, users: normalizeUsers(raw) };
}

export function loadDisplayModeFromStorage(): number {
  return normalizeDisplayMode(
    getGmValue<number>(DISPLAY_MODE_KEY, DEFAULT_DISPLAY_MODE),
  );
}

export function saveUsersToStorage(users: BiliUser[]) {
  setGmValue(USERS_KEY, users);
}

export function saveDisplayModeToStorage(mode: number) {
  setGmValue(DISPLAY_MODE_KEY, mode);
}

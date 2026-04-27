import type { BiliUser } from "../types";
import { DEFAULT_AVATAR_URL } from "../dom/dom-utils";

type RawUserRecord = Partial<BiliUser> & { bid?: unknown };

interface NormalizeUserOptions {
  requireMemo?: boolean;
  requireNickname?: boolean;
  fallbackNicknameToId?: boolean;
}

function getUserEntries(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    return Object.values(raw as Record<string, unknown>);
  }
  return [];
}

export function normalizeUserRecord(
  raw: unknown,
  {
    requireMemo = false,
    requireNickname = false,
    fallbackNicknameToId = false,
  }: NormalizeUserOptions = {},
): BiliUser | null {
  if (!raw || typeof raw !== "object") return null;

  const record = raw as RawUserRecord;
  const id = String(record.id ?? record.bid ?? "").trim();
  if (!id) return null;

  const memo = String(record.memo ?? "").trim();
  if (requireMemo && !memo) return null;

  let nickname = String(record.nickname ?? "").trim();
  if (!nickname && fallbackNicknameToId) {
    nickname = id;
  }
  if (requireNickname && !nickname) return null;

  return {
    id,
    nickname,
    avatar: String(record.avatar || DEFAULT_AVATAR_URL),
    memo,
    isDeleted: record.isDeleted === true ? true : undefined,
  };
}

export function normalizeUserCollection(
  raw: unknown,
  options?: NormalizeUserOptions,
): BiliUser[] {
  const users = new Map<string, BiliUser>();

  getUserEntries(raw).forEach((entry) => {
    const normalized = normalizeUserRecord(entry, options);
    if (!normalized) return;
    users.set(normalized.id, normalized);
  });

  return Array.from(users.values());
}







import type { BiliUser } from "../types";

const MATCH_BY_NAME_IGNORED_NAMES = new Set(["账号已注销"]);

export interface UniqueNameMatchResult {
  user?: BiliUser;
  reason: "none" | "ignored" | "ambiguous" | "unique";
}

export function findUniqueUserByName(
  users: readonly BiliUser[],
  name: string,
): UniqueNameMatchResult {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { reason: "none" };
  }

  if (MATCH_BY_NAME_IGNORED_NAMES.has(trimmedName)) {
    return { reason: "ignored" };
  }

  let matchedUser: BiliUser | undefined;
  let matchCount = 0;

  users.forEach((user) => {
    if (user.nickname !== trimmedName) return;
    matchCount++;
    if (matchCount === 1) {
      matchedUser = user;
    }
  });

  if (matchCount === 0) {
    return { reason: "none" };
  }

  if (matchCount > 1) {
    return { reason: "ambiguous" };
  }

  return { user: matchedUser, reason: "unique" };
}

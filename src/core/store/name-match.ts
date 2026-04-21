import type { BiliUser } from "../types";

export interface UniqueNameMatchResult {
  user?: BiliUser;
  reason: "empty" | "none" | "ambiguous" | "unique";
}

export function findUniqueUserByName(
  users: readonly BiliUser[],
  name: string,
): UniqueNameMatchResult {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { reason: "empty" };
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

export function resolveUniqueUserIdByName(
  users: readonly BiliUser[],
  name: string,
): string | null {
  return findUniqueUserByName(users, name).user?.id || null;
}

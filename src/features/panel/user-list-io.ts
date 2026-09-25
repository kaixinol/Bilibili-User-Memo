import { validateEitherJSON } from "@/core/rules/schema";
import type { BiliUser } from "@/core/types";
import { normalizeUserCollection } from "@/core/store/user-normalization";
import { logger } from "@/utils/logger";
import { getUserInfo, type UserInfo } from "@/core/api/bilibili-user";
import { isNoFaceAvatar } from "@/core/dom/avatar-utils";
import pLimit from "p-limit";

type UserProfile = UserInfo & { id: string };

const REFRESH_PROFILE_CONCURRENCY = 4;

type ImportReadResult =
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "ok"; users: BiliUser[] };

function pickJsonFile(): Promise<File | null> {
  // resolve 在 promise 已 settle 后是 no-op，change/cancel 重复触发天然安全
  const { promise, resolve } = Promise.withResolvers<File | null>();

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = () => resolve(input.files?.[0] ?? null);
  input.oncancel = () => resolve(null);
  input.click();

  return promise;
}

export async function readImportUsersFromDialog(): Promise<ImportReadResult> {
  const file = await pickJsonFile();
  if (!file) return { status: "cancelled" };

  try {
    const parsedData = JSON.parse(await file.text());
    const validation = validateEitherJSON(parsedData);
    if (!validation.ok) {
      return { status: "error", message: `导入失败：${validation.error}` };
    }

    const importedUsers = normalizeUserCollection(parsedData, {
      requireNickname: true,
    });
    if (importedUsers.length === 0) {
      return { status: "error", message: "导入失败：没有有效的用户数据" };
    }

    return { status: "ok", users: importedUsers };
  } catch {
    return { status: "error", message: "导入失败：JSON 格式错误或数据解析失败" };
  }
}

export function exportUsersAsJson(users: BiliUser[]) {
  const exportData = users.map((user) => {
    const data: Record<string, unknown> = {
      id: user.id,
      nickname: user.nickname,
      memo: user.memo || "",
    };

    // Only include avatar if it's not the default noface avatar
    if (user.avatar && !isNoFaceAvatar(user.avatar)) {
      data.avatar = user.avatar;
    }

    // Only include isDeleted if it's true (deleted account)
    if (user.isDeleted === true) {
      data.isDeleted = true;
    }

    // Only include memoDetail if it's not empty
    if (user.memoDetail) {
      data.memoDetail = user.memoDetail;
    }

    return data;
  });
  const jsonContent = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonContent], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bili-user-notes-${new Date().toISOString().split("T")[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchLatestProfiles(
  users: BiliUser[],
  onProgress: () => void,
): Promise<UserProfile[]> {
  const profiles: UserProfile[] = [];
  const limit = pLimit(REFRESH_PROFILE_CONCURRENCY);
  let stoppedByApiError = false;

  const tasks = users.map((user) => limit(async () => {
    try {
      if (stoppedByApiError) return;

      const newData = await getUserInfo(String(user.id));
      if (stoppedByApiError) return;
      if (!newData) {
        stoppedByApiError = true;
        return;
      }
      if (!newData.nickname) {
        return;
      }
      profiles.push({
        id: user.id,
        nickname: newData.nickname,
        avatar: newData.avatar,
        isDeleted: newData.isDeleted,
      });
    } catch (error) {
      if (stoppedByApiError) return;
      logger.error(`刷新用户 [${user.id}] 失败:`, error);
    } finally {
      onProgress();
    }
  }));
  await Promise.allSettled(tasks);
  return profiles;
}

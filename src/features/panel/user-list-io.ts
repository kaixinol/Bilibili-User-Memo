import { validateEitherJSON } from "@/core/rules/schema";
import type { BiliUser } from "@/core/types";
import { normalizeUserCollection } from "@/core/store/user-normalization";
import { logger } from "@/utils/logger";
import { getUserInfo } from "@/utils/sign";
import { DEFAULT_AVATAR_URL } from "@/core/dom/dom-utils";

interface UserProfile {
  id: string;
  nickname: string;
  avatar: string;
  isDeleted?: boolean;
}

type ImportReadResult =
  | { status: "cancelled" }
  | { status: "error"; message: string }
  | { status: "ok"; users: BiliUser[] };

function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      resolve(file);
    };

    input.type = "file";
    input.accept = "application/json";
    input.onchange = () => {
      finish(input.files?.[0] || null);
    };
    input.oncancel = () => finish(null);
    input.click();
  });
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
    if (user.avatar && user.avatar !== DEFAULT_AVATAR_URL) {
      data.avatar = user.avatar;
    }

    // Only include isDeleted if it's true (deleted account)
    if (user.isDeleted === true) { // QUESTION: isDeleted = True时，会不会忽略自定义头像
      data.isDeleted = true;
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
  const tasks = users.map(async (user) => {
    try {
      const newData = await getUserInfo(String(user.id));
      if (!newData.nickname) return;
      profiles.push({
        id: user.id,
        nickname: newData.nickname,
        avatar: newData.avatar,
        isDeleted: newData.isDeleted,
      });
    } catch (error) {
      logger.error(`刷新用户 [${user.id}] 失败:`, error);
    } finally {
      onProgress();
    }
  });
  await Promise.allSettled(tasks);
  return profiles;
}









import { validateEitherJSON } from "../configs/schema";
import { BiliUser } from "../core/types";
import { logger } from "../utils/logger";
import { getUserInfo } from "../utils/sign";

interface UserProfile {
  id: string;
  nickname: string;
  avatar: string;
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

function normalizeImportedUsers(parsedData: unknown): BiliUser[] {
  if (Array.isArray(parsedData)) {
    return parsedData.map((user: any) => ({
      id: user.id || user.bid,
      nickname: user.nickname || "",
      avatar: user.avatar || "",
      memo: user.memo || "",
    }));
  }

  if (parsedData && typeof parsedData === "object") {
    return Object.values(parsedData as Record<string, any>).map((user: any) => ({
      id: user.id || user.bid,
      nickname: user.nickname || "",
      avatar: user.avatar || "",
      memo: user.memo || "",
    }));
  }

  return [];
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

    const importedUsers = normalizeImportedUsers(parsedData).filter(
      (user) => user.id && user.nickname,
    );
    if (importedUsers.length === 0) {
      return { status: "error", message: "导入失败：没有有效的用户数据" };
    }

    return { status: "ok", users: importedUsers };
  } catch {
    return { status: "error", message: "导入失败：JSON 格式错误或数据解析失败" };
  }
}

export function exportUsersAsJson(users: BiliUser[]) {
  const exportData = users.map((user) => ({
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar || "",
    memo: user.memo || "",
  }));
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

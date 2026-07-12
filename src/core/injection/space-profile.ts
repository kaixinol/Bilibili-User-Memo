import { extractUid } from "../dom/uid-extractor";
import { isNoFaceAvatar, parseSrcsetUrl } from "../dom/avatar-utils";
import { userStore } from "../store/store";
import { getSilentAvatarUpdate } from "@/features/panel/user-list-store";
import { waitUntil } from "@/utils/scheduler";

const SPACE_PROFILE_NICKNAME_SELECTOR = ".upinfo-detail div.nickname";
const SPACE_AVATAR_SELECTOR = "div.avatar source";

export async function syncSpaceProfile() {
  if (location.hostname !== "space.bilibili.com") return;
  await syncSpaceProfileNickname();
  await addSpaceProfilePicture();
}

async function syncSpaceProfileNickname() {
  const uid = extractUid(document.body, { silent: true });
  if (!uid) return;

  await waitUntil(
    () => Boolean(document.querySelector(SPACE_PROFILE_NICKNAME_SELECTOR)),
    {
      intervalMs: 200,
      timeoutMs: 5000,
    },
  );

  const nicknameEl = document.querySelector(
    SPACE_PROFILE_NICKNAME_SELECTOR,
  ) as HTMLElement | null;
  const nickname =
    nicknameEl?.dataset.biliOriginal?.trim() ||
    nicknameEl?.textContent?.trim() ||
    "";
  if (!nickname || uid !== extractUid(document.body, { silent: true })) return;

  userStore.updateUser(uid, { nickname }, nickname);
}

async function addSpaceProfilePicture() {
  if (!getSilentAvatarUpdate()) return;

  const uid = extractUid(document.body, { silent: true });
  if (!uid) return;

  const storedUser = userStore.getUsers().find((u) => u.id === uid);
  if (!storedUser) return;

  await waitUntil(
    () => Boolean(document.querySelector(SPACE_AVATAR_SELECTOR)),
    { intervalMs: 200, timeoutMs: 5000 },
  );

  const avatarEl = document.querySelector(SPACE_AVATAR_SELECTOR);
  const srcset = avatarEl?.getAttribute("srcset");
  if (!srcset) return;

  const avatarUrl = parseSrcsetUrl(srcset);
  if (!avatarUrl || isNoFaceAvatar(avatarUrl)) return;

  if (uid !== extractUid(document.body, { silent: true })) return;

  userStore.updateUser(uid, { avatar: avatarUrl });
}

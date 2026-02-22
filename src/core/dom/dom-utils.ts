import { querySelectorDeep } from "query-selector-shadow-dom";

const DEFAULT_AVATAR_URL =
  "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif";

/**
 * 获取用户头像 URL
 * 尝试从 DOM 中查找现有的头像元素，找不到则使用默认图
 */
export function getUserAvatar(userID: string): string {
  // 尝试找 avif
  const sourceSrc = querySelectorDeep(
    `#user-avatar[data-user-profile-id="${userID}"] bili-avatar source , div.avatar source`,
  )?.getAttribute("srcset");
  if (sourceSrc) return sourceSrc;

  // 尝试找 img
  const imgSrc = querySelectorDeep(
    `up-avatar-wrap a[href*="${userID}"] img.bili-avatar-img`,
  )?.getAttribute("data-src");
  if (imgSrc) return imgSrc;

  // 默认头像
  return DEFAULT_AVATAR_URL;
}

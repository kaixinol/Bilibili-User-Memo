import { getCaller } from "@/utils/caller";
import { logger } from "@/utils/logger";
import { querySelectorDeep } from "@/utils/query-dom";

export const DEFAULT_AVATAR_URL =
  "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif";

export function isNoFaceAvatar(url: string): boolean {
  return url.includes("noface.jpg");
}

/**
 * 获取用户头像 URL
 * 尝试从 DOM 中查找现有的头像元素，找不到则使用默认图
 */
type AvatarRule = {
  selector: string;
  attr: string;
};
export function getUserAvatarFromDOM(userID: string): string {
  logger.debug(`Getting avatar for user ${userID}, called from: ${getCaller()}`);

  const rules: AvatarRule[] = [
    {
      selector: `#user-avatar[data-user-profile-id="${userID}"] bili-avatar source`, // 评论区
      attr: "srcset",
    },
    {
      selector: `#user-avatar[data-user-profile-id="${userID}"] img`, // 评论区回复
      attr: "src",
    },
    {
      selector: `a[href*="${userID}"] img.bili-avatar-img`,
      attr: "data-src", // 忘了是啥，旧版专栏？
    },
    {
      selector: `.bili-dyn-item__main source`, // 旧动态顶部
      attr: "srcset",
    },
    {
      selector: `div.avatar source`,
      attr: "srcset", // 个人空间顶部
    },
  ];

  for (const { selector, attr } of rules) {
    const el = querySelectorDeep(selector);
    logger.debug(`Found avatar for user ${userID} in ${selector}`);
    const val = el?.getAttribute(attr);
    if (val) return val;
  }

  return DEFAULT_AVATAR_URL;
}

// function findAvatarAncestor(el: HTMLElement): HTMLElement | null {
//   let depth = 0;
//   let cur: HTMLElement | null = el.parentElement;

//   while (cur) {
//     depth++;

//     if (depth >= 3 && cur.classList.contains("avatar")) {
//       return cur;
//     }

//     cur = cur.parentElement;
//   }

//   return null;
// }

import { getCaller } from "@/features/debugger/debugger";
import { logger } from "@/utils/logger";
import { querySelectorDeep } from "query-selector-shadow-dom";

export const DEFAULT_AVATAR_URL =
  "https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif";

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
      selector: `div.avatar source`,
      attr: "srcset", // 个人空间顶部
    },
    {
      selector: `up-avatar-wrap a[href*="${userID}"] img.bili-avatar-img`,
      attr: "data-src", // 忘了是啥
    },
  ];

  for (const { selector, attr } of rules) {
    const el = querySelectorDeep(selector);
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
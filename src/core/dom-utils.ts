// src/core/dom-utils.ts
import { querySelectorDeep } from "query-selector-shadow-dom";
import { logger } from "../utils/logger";
import { PageRule } from "../configs/rules";
import { BiliUser } from "./types";

/**
 * 尝试从 DOM 元素中提取 B站 UID
 * 策略：href -> data-id -> __INITIAL_STATE__ 全局变量
 */
export function extractUid(el: Element): string | null {
  const dataUid =
    el.getAttribute("data-id")?.split("_")?.[1] ||
    el.getAttribute("data-user-profile-id");

  if (dataUid) return dataUid;
  const win = unsafeWindow as any;
  const initialState = win.__INITIAL_STATE__;

  const href = el.getAttribute("href") || location.href;
  if (href) {
    const match = href.match(/space\.bilibili\.com\/(\d+)/);
    if (match) return match[1];
  }
  const fallbackUid =
    initialState?.detail?.basic?.uid ||
    initialState?.detail?.modules?.find((m: any) => m.module_author)
      ?.module_author?.mid;
  if (fallbackUid) return fallbackUid;

  logger.warn(`⚠️ 无法从元素中提取 UID:`, el);
  return null;
}

/**
 * 获取元素应显示的原始名称
 * @param el 目标 DOM 元素
 * @param rule 当前匹配的规则
 */
export function getElementDisplayName(el: HTMLElement, rule: PageRule): string {
  if (rule.textSelector) {
    const target = el.querySelector(rule.textSelector) as HTMLElement | null;
    if (target?.textContent) return target.textContent.trim();
  }
  return el.textContent?.trim() || "";
}

/**
 * 根据显示模式格式化最终文本
 * @param user 用户数据
 * @param fallbackName 原始名称
 * @param displayMode 显示模式 (0:原名, 1:备注(原名), 2:原名(备注), 3:仅备注)
 */
export function formatDisplayName(
  user: BiliUser | undefined,
  fallbackName: string,
  displayMode: number,
): string {
  const nickname = (user?.nickname || fallbackName || "").trim();
  const memo = (user?.memo || "").trim();

  // 如果没有备注，始终显示原名
  if (!memo) return nickname;

  switch (displayMode) {
    case 0: // 仅显示原名 (相当于关闭)
      return nickname;
    case 1: // 备注 (原名)
      return `${memo}(${nickname})`;
    case 2: // 原名 (备注) - 默认
      return `${nickname}(${memo})`;
    case 3: // 仅显示备注
      return memo;
    default:
      return nickname;
  }
}

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
  return `https://i0.hdslb.com/bfs/face/member/noface.jpg@96w_96h_1c_1s.avif`;
}

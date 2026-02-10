// src/core/types.ts

/**
 * B站用户数据模型
 */
export interface BiliUser {
  id: string; // UID
  nickname: string; // 抓取到的原始昵称
  avatar: string; // 头像 URL
  memo: string; // 用户备注
}

/**
 * 用于 Injector 内部传递元数据
 */
export interface ElementMeta {
  uid: string;
  originalName: string;
}

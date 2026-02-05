export enum InjectionMode {
  Static = 1, // 適合：一次性全局樣式
  Dynamic = 2, // 適合：需要監聽元素變化並實時修改
}

/**
 * 定義樣式的影響深度
 */
export enum StyleScope {
  /** 显示修改的名稱 */
  Minimal = 1,
  /** 显示修改的名稱 + 點擊文字修改名字 */
  Editable = 2,
  /** 显示修改的名稱 + 相關交互按鈕 */
  Extended = 3,
}

/**
 * 基礎規則接口
 */
/**
 * 基礎頁面規則接口，定義所有注入模式共有的屬性
 */
interface BasePageRule {
  /** * 規則名稱（例如："視頻頁面"、"用戶空間"）
   * 主要用於日誌輸出、調試或 UI 顯示
   */
  name: string;

  /** * 樣式作用範圍與交互深度
   * Minimal: 僅更名 | Editable: 點擊文字修改 | Extended: 顯示完整控制按鈕
   */
  styleScope: StyleScope;

  /** * 目標元素的 CSS 選擇器
   * 這是樣式注入的主要對象（例如：".user-name"）
   */
  aSelector: string;

  /** * 提取文本內容的特定選擇器
   * 可選屬性。若不提供，邏輯將默認使用 `aSelector`。
   * 適用場景：當 aSelector 是一個容器，而真正的名字在內層某個 span 時使用
   */
  textSelector?: string;
}

/**
 * 靜態模式：不允許有 trigger
 */
interface StaticPageRule extends BasePageRule {
  injectMode: InjectionMode.Static;
  trigger?: never; // 強制不允許 trigger
}

/**
 * 動態模式：trigger 為必填（觀察 watch、用 interval 防抖）
 */
interface DynamicPageRule extends BasePageRule {
  injectMode: InjectionMode.Dynamic;
  trigger: {
    watch: string;
    interval: number;
  };
}

/**
 * 聯合類型：根據 injectMode 自動切換 trigger 的約束
 */
type PageRule = StaticPageRule | DynamicPageRule;

/**
 * SiteConfig 定義為 Map
 */
type SiteConfig = Map<RegExp, PageRule>;
export const config: SiteConfig = new Map([
  [
    /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    {
      name: "视频页面",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Extended,
      aSelector: ".up-name",
    },
  ],
  [
    /^https:\/\/space\.bilibili\.com\/.*/,
    {
      name: "空间",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: ".nickname",
    },
  ],
  [
    /^https:\/\/space\.bilibili\.com\/\d+\/favlist?fid=\d+&ftype=create/,
    {
      name: "空间收藏夹",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__author",
      trigger: { watch: ".favlist-main", interval: 1000 },
    },
  ],
  [
    /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    {
      name: "评论区",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Extended,
      aSelector: "#user-name a",
      trigger: { watch: "#contents", interval: 1000 },
    },
  ],
]);
// https://github.com/kaixinol/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md#javascript

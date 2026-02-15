export enum InjectionMode {
  Static = 1, // 適合：一次性全局樣式
  Dynamic = 2, // 適合：需要監聽元素變化並實時修改
  Polling = 3, // 適合：需要固定間隔輪詢掃描，不推薦用，除非確實沒辦法了。
}

/**
 * 定義樣式的影響深度
 */
export enum StyleScope {
  /** 显示修改的名稱 */
  Minimal = 1,
  /** 显示修改的名稱 + 點擊文字修改名字 */
  Editable = 2,
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
  /** * 提取文本內容的特定選擇器
   * 可選屬性。若不提供，邏輯將默認使用 `aSelector`。
   * 適用場景：當 aSelector 是一個容器，而真正的名字在內層某個 span 時使用
   */
  injectMode: InjectionMode;
  fontSize?: string;
  ignoreProcessed?: boolean;
  useFallback?: boolean;
  matchByName?: boolean;
}

/**
 * 靜態模式：不允許有 trigger
 */

interface TriggerConfig {
  watch: string;
  interval: number;
}

/**
 * 聯合類型：根據 injectMode 自動切換 trigger 的約束
 */
type PageRuleBase = BasePageRule &
  (
    | { aSelector: string; textSelector?: string }
    | { aSelector?: string; textSelector: string }
  );
export type StaticPageRule = PageRuleBase & {
  injectMode: InjectionMode.Static;
};
export type DynamicPageRule = PageRuleBase & {
  injectMode: InjectionMode.Dynamic;
  trigger: TriggerConfig;
  dynamicWatch?: boolean;
};
export type PollingPageRule = PageRuleBase & {
  injectMode: InjectionMode.Polling;
  trigger: TriggerConfig;
};
export type PageRule = StaticPageRule | DynamicPageRule | PollingPageRule;
/**
 * SiteConfig 定義為 Map
 */
type SiteConfig = Map<RegExp, PageRule>;
// TODO: 改成YAML
export const config: SiteConfig = new Map([
  [
    /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    {
      name: "视频页面",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: ".up-name",
    },
  ],
  [
    /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    {
      name: "视频页面",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Minimal,
      aSelector: "a.staff-name",
    },
  ],
  [
    /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    {
      name: "视频页面 - 推荐",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: ".upname a",
      textSelector: "span.name",
      trigger: { watch: ".rcmd-tab", interval: 1000 },
    },
  ],
  [
    /^https:\/\/space\.bilibili\.com\/.*/,
    {
      name: "空间",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: ".nickname",
      fontSize: "24px",
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
      styleScope: StyleScope.Editable,
      aSelector: "#user-name a",
      trigger: { watch: "div#contents", interval: 500 },
      dynamicWatch: true,
    },
  ],
  [
    /^https:\/\/message\.bilibili\.com\/.*\/whisper\//,
    {
      name: "个人消息 - 私信",
      injectMode: InjectionMode.Polling,
      styleScope: StyleScope.Minimal,
      aSelector: 'div[data-id^="contact"], div[class^="_ContactName_"]',
      textSelector:
        'div[class*="_SessionItem__Name"], div[class^="_ContactName_"]',
      trigger: {
        watch: 'div[class^="_IM_"]',
        interval: 2000,
      },
      ignoreProcessed: true,
    },
  ],
  [
    /^https:\/\/space\.bilibili\.com\/\d+\/dynamic\/*/,
    {
      name: "个人空间动态",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
      trigger: { watch: ".bili-dyn-list", interval: 1000 },
    },
  ],
  [
    /^https:\/\/message\.bilibili\.com\/.*\/(reply|love|at)\//,
    {
      name: "个人消息 - 回复/赞/AT",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: "a.interaction-item__uname",
      trigger: { watch: "div.message-content", interval: 1000 },
    },
  ],
  [
    /^https:\/\/t\.bilibili\.com\/.*/,
    {
      name: "动态页",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
      trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
      dynamicWatch: true,
      useFallback: true,
      matchByName: true,
    },
  ],
  [
    /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    {
      name: "最近 - UP动态",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      aSelector: "div.user-name a",
      trigger: { watch: "div.header-content-panel", interval: 1000 },
    },
  ],

  [
    /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    {
      name: "最近 - 收藏夹",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal, // Editable 导致bug
      aSelector: "span.header-fav-card__info--name",
      textSelector: "span.header-fav-card__info--name span",
      trigger: {
        watch: "div.favorite-panel-popover",
        interval: 1000,
      },
    },
  ],
  [
    /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    {
      name: "最近 - 历史",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      textSelector: "div.header-history-card__info--name span",
      trigger: {
        watch: "div.history-panel-popover",
        interval: 1000,
      },
      matchByName: true,
    },
  ],
  [
    /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    {
      name: "最近 - 正在直播",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: "a.up-item",
      textSelector: "div.up-name",
      trigger: {
        watch: "div.living-up-list",
        interval: 1000,
      },
      matchByName: true,
      useFallback: true,
    },
  ],
  [
    /^https:\/\/www.bilibili\.com\/opus\/\d+/,
    {
      name: "新版动态",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: "div.opus-module-author__name",
    },
  ],
]);
// https://github.com/kaixinol/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md#javascript

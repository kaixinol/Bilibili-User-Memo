import { parse } from "valibot";
import {
  InjectionMode,
  StyleScope,
  normalizeEntry,
  RawConfigSchema,
  type RuleConfigEntry,
} from "./rule-types";

export {
  InjectionMode,
  StyleScope,
} from "./rule-types";
export type {
  DynamicPageRule,
  DynamicTriggerConfig,
  PageRule,
  PollingPageRule,
  PollingTriggerConfig,
  RuleConfigEntry,
  RuleTextSource,
  StaticPageRule,
} from "./rule-types";

/**
 * 规则配置使用数组而不是 Map：
 * - 同一个 URL 正则可以声明多条规则
 * - 避免 Map 键唯一语义造成"后写覆盖前写"的误解
 */
const rawConfig = [
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: {
      name: "视频页面",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: ".up-name",
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: {
      name: "视频页面",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Minimal,
      aSelector: "a.staff-name",
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: {
      name: "视频页面 - 推荐",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: ".upname a",
      textSelector: "span.name",
      trigger: { watch: ".rcmd-tab", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/space\.bilibili\.com\/.*/,
    rule: {
      name: "空间",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: ".nickname",
      fontSize: "24px",
    },
  },
  {
    urlPattern:
      /^https:\/\/space\.bilibili\.com\/\d+\/favlist\?(?=[^#]*\bfid=\d+\b)(?=[^#]*\bftype=create\b)[^#]*(?:#.*)?$/,
    rule: {
      name: "空间收藏夹",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__author",
      textSelector: ".bili-video-card__text span[title]",
      trigger: { watch: ".favlist-main", interval: 1000 },
    },
  },
  {
    urlPattern:
      /^https:\/\/www\.bilibili\.com\/watchlater\/list(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "稍后再看",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__author",
      textSelector: ".bili-video-card__text span[title]",
      trigger: { watch: "body", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "首页推荐",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/search\.bilibili\.com\/(?:all|video|bangumi|pgc|live|article|user)(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "搜索结果",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/v\/popular\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "热门页",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/v\/[a-z]+\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "分区页",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/c\/[a-z0-9_-]+\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: {
      name: "频道页",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    rule: {
      name: "评论区",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      aSelector: "#user-name a",
      trigger: { watch: "div#contents", interval: 500 },
      dynamicWatch: true,
    },
  },
  {
    urlPattern:
      /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
    rule: {
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
  },
  {
    urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic\/*/,
    rule: {
      name: "个人空间动态",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
      trigger: { watch: ".bili-dyn-list", interval: 1000 },
    },
  },
  {
    urlPattern:
      /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?(?:reply|love|at)(?:\/|$)/,
    rule: {
      name: "个人消息 - 回复/赞/AT",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal,
      aSelector: "a.interaction-item__uname",
      trigger: { watch: "div.message-content", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/t\.bilibili\.com\/.*/,
    rule: {
      name: "动态页",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
      trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
      dynamicWatch: true,
      matchByName: true,
    },
  },
  {
    urlPattern: /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    rule: {
      name: "最近 - UP动态",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Editable,
      aSelector: "div.user-name a",
      trigger: { watch: "div.header-content-panel", interval: 1000 },
    },
  },
  {
    urlPattern: /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    rule: {
      name: "最近 - 收藏夹",
      injectMode: InjectionMode.Dynamic,
      styleScope: StyleScope.Minimal, // Editable 会导致样式冲突
      aSelector: "span.header-fav-card__info--name",
      textSelector: "span.header-fav-card__info--name span",
      trigger: {
        watch: "div.favorite-panel-popover",
        interval: 1000,
      },
    },
  },
  {
    urlPattern: /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    rule: {
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
  },
  {
    urlPattern: /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/,
    rule: {
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
      textSource: "watch",
    },
  },
  {
    urlPattern: /^https:\/\/www.bilibili\.com\/opus\/\d+/,
    rule: {
      name: "新版动态",
      injectMode: InjectionMode.Static,
      styleScope: StyleScope.Editable,
      aSelector: "div.opus-module-author__name",
    },
  },
] as const;

export const config: RuleConfigEntry[] = parse(RawConfigSchema, rawConfig).map(
  normalizeEntry,
);

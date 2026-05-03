import { RawRule, StyleScope, type RawConfig, type UidResolverFn } from "./rule-types";
export { StyleScope, InjectionMode } from "./rule-types";
const COMMON_REG = /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/;
const r = (rule: Partial<RawRule> & { uidResolver?: UidResolverFn }) => new RawRule(rule);
const rawConfig: RawConfig[] = [
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: r({ name: "视频页面", styleScope: StyleScope.Editable, aSelector: ".up-name" })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: r({ name: "视频页面-Staff", styleScope: StyleScope.Editable, aSelector: "a.staff-name" })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: r({
      name: "视频页面-推荐",
      styleScope: StyleScope.Minimal,
      aSelector: ".upname a",
      textSelector: "span.name",
      trigger: { watch: ".rcmd-tab", interval: 1000 }
    })
  },
  {
    urlPattern: /^https:\/\/space\.bilibili\.com\/.*/,
    rule: r({ name: "空间", styleScope: StyleScope.Editable, aSelector: ".nickname" })
  },
  {
    urlPattern: /^https:\/\/space\.bilibili\.com\/.*/,
    rule: r({ name: "空间关注/粉丝", styleScope: StyleScope.Editable, aSelector: "a.relation-card-info__uname" })
  },
  {
    urlPattern:
      /^https:\/\/space\.bilibili\.com\/\d+\/favlist\?(?=[^#]*\bfid=\d+\b)(?=[^#]*\bftype=create\b)[^#]*(?:#.*)?$/,
    rule: r({
      name: "空间收藏夹",
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__author",
      textSelector: ".bili-video-card__text span[title]",
      trigger: { watch: ".favlist-main", interval: 1000 },
    })
  },
  {
    urlPattern:
      /^https:\/\/www\.bilibili\.com\/watchlater\/list(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "稍后再看",
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__author",
      textSelector: ".bili-video-card__text span[title]",
      trigger: { watch: "body", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "首页",
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/search\.bilibili\.com\/(?:all|video|bangumi|pgc|live|article|user)(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "搜索",
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/v\/popular\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "热门",
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/v\/[a-z]+\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "分区",
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/c\/[a-z0-9_-]+\/?(?:\?[^#]*)?(?:#.*)?$/,
    rule: r({
      name: "频道",
      styleScope: StyleScope.Minimal,
      aSelector:
        ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
      textSelector:
        ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
      trigger: { watch: "#app", interval: 1000 },
    })
  },
  {
    urlPattern: COMMON_REG,
    rule: r({
      name: "评论区",
      styleScope: StyleScope.Editable,
      aSelector: "#user-name a",
      trigger: { watch: "div#contents", interval: 1000 },
      dynamicWatch: true
    })
  },
  {
    urlPattern: /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
    rule: r({
      name: "私信",
      styleScope: StyleScope.Minimal,
      aSelector: 'div[data-id^="contact"], div[class^="_ContactName_"]',
      textSelector: 'div[class*="_SessionItem__Name"], div[class^="_ContactName_"]',
      trigger: { watch: 'div[class^="_IM_"]', interval: 2000 },
      ignoreProcessed: true,
      uidResolver: (el) =>
        el.closest('[data-id^="contact_"]')?.getAttribute("data-id")?.split("_")?.[1] || null,
      matchByName: true,
    })
  },
  {
    urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic\/*/,
    rule: r({
      name: "个人空间动态",
      styleScope: StyleScope.Minimal,
      aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
      trigger: { watch: ".bili-dyn-list", interval: 1000 },
    })
  },
  {
    urlPattern:
      /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?(?:reply|love|at)(?:\/|$)/,
    rule: r({
      name: "回复/赞/AT",
      styleScope: StyleScope.Minimal,
      aSelector: "a.interaction-item__uname",
      trigger: { watch: "div.message-content", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/t\.bilibili\.com\/.*/,
    rule: r({
      name: "动态页",
      styleScope: StyleScope.Editable,
      textSelector: "span.bili-dyn-title__text",
      trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
      dynamicWatch: true,
      matchByName: true
    })
  },
  // 弹出层规则
  {
    urlPattern: COMMON_REG,
    rule: r({
      name: "最近-UP动态",
      styleScope: StyleScope.Editable,
      aSelector: "div.user-name a",
      trigger: { watch: "div.header-content-panel", interval: 1000 },
    })
  },
  {
    urlPattern: COMMON_REG,
    rule: r({
      name: "最近-收藏夹",
      styleScope: StyleScope.Minimal,
      aSelector: "span.header-fav-card__info--name",
      textSelector: "span.header-fav-card__info--name span",
      trigger: { watch: "div.favorite-panel-popover", interval: 1000 },
    })
  },
  {
    urlPattern: COMMON_REG,
    rule: r({
      name: "最近-历史",
      styleScope: StyleScope.Editable,
      textSelector: "div.header-history-card__info--name span",
      trigger: { watch: "div.history-panel-popover", interval: 1000 },
      matchByName: true,
    })
  },
  {
    urlPattern: COMMON_REG,
    rule: r({
      name: "最近-正在直播",
      styleScope: StyleScope.Minimal,
      aSelector: "a.up-item",
      textSelector: "div.up-name",
      trigger: { watch: "div.living-up-list", interval: 1000 },
    })
  },
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/opus\/\d+/,
    rule: r({
      name: "新版动态",
      styleScope: StyleScope.Editable,
      aSelector: "div.opus-module-author__name",
    })
  }
];
export const config = rawConfig;
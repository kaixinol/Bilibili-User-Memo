import { RawRule, StyleScope, type RawConfig } from "./rule-types";
export { StyleScope, InjectionMode, getInjectionMode } from "./rule-types";
const COMMON_REG = /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/;
const r = (rule: Partial<RawRule>) => new RawRule(rule);
const rawConfig: RawConfig[] = [
  {
    urlPattern: /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/,
    rule: r({ name: "视频页面", styleScope: StyleScope.Editable, aSelector: ".up-name" })
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
    urlPattern: COMMON_REG,
    rule: r({
      name: "评论区",
      styleScope: StyleScope.Editable,
      aSelector: "#user-name a",
      trigger: { watch: "div#contents", interval: 500 },
      dynamicWatch: true
    })
  },
  {
    urlPattern: /^https:\/\/message\.bilibili\.com\/.*whisper/,
    rule: r({
      name: "私信",
      styleScope: StyleScope.Minimal,
      aSelector: 'div[data-id^="contact"]',
      trigger: { watch: 'div[class^="_IM_"]', interval: 2000 },
      ignoreProcessed: true // 隐式判定为 Polling
    })
  },
  {
    urlPattern: /^https:\/\/t\.bilibili\.com\/.*/,
    rule: r({
      name: "动态页",
      styleScope: StyleScope.Editable,
      aSelector: "span.bili-dyn-title__text",
      trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
      dynamicWatch: true,
      matchByName: true
    })
  },
  // 批量生成：首页/搜索/热门
  ...["首页", "搜索", "热门"].map(name => ({
    urlPattern: name === "首页" ? /^https:\/\/www\.bilibili\.com\/?(\?.*)?$/ :
      name === "搜索" ? /^https:\/\/search\.bilibili\.com\/.*/ :
        /^https:\/\/www\.bilibili\.com\/v\/popular\/?/,
    rule: r({
      name,
      styleScope: StyleScope.Minimal,
      aSelector: ".bili-video-card__info--owner",
      textSelector: ".bili-video-card__info--author",
      trigger: { watch: "#app", interval: 1000 }
    })
  })),
  // 弹出层规则
  ...[
    { name: "最近-UP动态", aSelector: "div.user-name a", watch: "div.header-content-panel" },
    { name: "最近-收藏夹", aSelector: "span.header-fav-card__info--name", watch: "div.favorite-panel-popover" }
  ].map(item => ({
    urlPattern: COMMON_REG,
    rule: r({
      name: item.name,
      styleScope: StyleScope.Minimal,
      aSelector: item.aSelector,
      trigger: { watch: item.watch, interval: 1000 }
    })
  }))
];
export const config = rawConfig;
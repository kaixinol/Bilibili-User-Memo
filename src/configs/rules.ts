import {
  array,
  boolean,
  check,
  instance,
  integer,
  literal,
  minValue,
  number,
  optional,
  parse,
  pipe,
  strictObject,
  string,
  union,
  variant,
  type InferOutput,
} from "valibot";

export enum InjectionMode {
  Static = 1, // 适合：一次性全局样式
  Dynamic = 2, // 适合：监听容器变化并按需局部刷新
  Polling = 3, // 适合：无法稳定监听时的固定间隔扫描
}

/**
 * 定义样式的影响深度
 */
export enum StyleScope {
  /** 仅显示改写后的名字 */
  Minimal = 1,
  /** 显示改写后的名字，并支持点击编辑备注 */
  Editable = 2,
}

/**
 * 文本提取来源：
 * - self: 在目标元素自身范围内寻找 textSelector
 * - watch: 在 trigger.watch 命中的容器范围内寻找 textSelector
 */
export type RuleTextSource = "self" | "watch";

type SelectorShape =
  | { aSelector: string; textSelector?: string }
  | { aSelector?: string; textSelector: string };

type RuleBase = SelectorShape & {
  name: string;
  styleScope: StyleScope;
  fontSize?: string;
  textSource: RuleTextSource;
  ignoreProcessed: boolean;
  matchByName: boolean;
};

export interface DynamicTriggerConfig {
  watch: string;
  debounceMs: number;
}

export interface PollingTriggerConfig {
  watch: string;
  intervalMs: number;
}

export type StaticPageRule = RuleBase & {
  injectMode: InjectionMode.Static;
  textSource: "self";
};

export type DynamicPageRule = RuleBase & {
  injectMode: InjectionMode.Dynamic;
  trigger: DynamicTriggerConfig;
  dynamicWatch: boolean;
};

export type PollingPageRule = RuleBase & {
  injectMode: InjectionMode.Polling;
  trigger: PollingTriggerConfig;
};

export type PageRule = StaticPageRule | DynamicPageRule | PollingPageRule;

export interface RuleConfigEntry {
  urlPattern: RegExp;
  rule: PageRule;
}

const StyleScopeSchema = union([
  literal(StyleScope.Minimal),
  literal(StyleScope.Editable),
]);

const selectorEntries = {
  aSelector: optional(string()),
  textSelector: optional(string()),
};

/**
 * Dynamic/Polling 里原始 `interval` 字段的语义：
 * - Dynamic: 防抖延迟（ms），normalize 后映射为 `trigger.debounceMs`
 * - Polling: 轮询周期（ms），normalize 后映射为 `trigger.intervalMs`
 */
const triggerSchema = strictObject({
  watch: string(),
  interval: pipe(number(), integer(), minValue(0)),
});

const StaticRuleSchema = pipe(
  strictObject({
    name: string(),
    styleScope: StyleScopeSchema,
    injectMode: literal(InjectionMode.Static),
    ...selectorEntries,
    textSource: optional(literal("self")),
    fontSize: optional(string()),
  }),
  check(
    (rule) => Boolean(rule.aSelector || rule.textSelector),
    "aSelector 和 textSelector 至少需要提供一个",
  ),
);

const DynamicRuleSchema = pipe(
  strictObject({
    name: string(),
    styleScope: StyleScopeSchema,
    injectMode: literal(InjectionMode.Dynamic),
    ...selectorEntries,
    textSource: optional(union([literal("self"), literal("watch")])),
    fontSize: optional(string()),
    trigger: triggerSchema,
    dynamicWatch: optional(boolean()),
    matchByName: optional(boolean()),
  }),
  check(
    (rule) => Boolean(rule.aSelector || rule.textSelector),
    "aSelector 和 textSelector 至少需要提供一个",
  ),
  check(
    (rule) => rule.textSource !== "watch" || Boolean(rule.textSelector),
    "textSource=watch 时必须提供 textSelector",
  ),
);

const PollingRuleSchema = pipe(
  strictObject({
    name: string(),
    styleScope: StyleScopeSchema,
    injectMode: literal(InjectionMode.Polling),
    ...selectorEntries,
    textSource: optional(union([literal("self"), literal("watch")])),
    fontSize: optional(string()),
    trigger: triggerSchema,
    ignoreProcessed: optional(boolean()),
    matchByName: optional(boolean()),
  }),
  check(
    (rule) => Boolean(rule.aSelector || rule.textSelector),
    "aSelector 和 textSelector 至少需要提供一个",
  ),
  check(
    (rule) => rule.textSource !== "watch" || Boolean(rule.textSelector),
    "textSource=watch 时必须提供 textSelector",
  ),
);

const RawRuleSchema = variant("injectMode", [
  StaticRuleSchema,
  DynamicRuleSchema,
  PollingRuleSchema,
]);

const RawRuleEntrySchema = strictObject({
  urlPattern: instance(RegExp),
  rule: RawRuleSchema,
});

const RawConfigSchema = array(RawRuleEntrySchema);

type RawRule = InferOutput<typeof RawRuleSchema>;
type RawRuleEntry = InferOutput<typeof RawRuleEntrySchema>;
type RawRuleBase = Omit<RawRule, "injectMode" | "trigger">;
type NormalizedRuleBase = {
  name: string;
  styleScope: StyleScope;
  fontSize?: string;
} & SelectorShape;

function normalizeSelectors(
  rawRule: Pick<RawRule, "aSelector" | "textSelector">,
): SelectorShape {
  if (rawRule.aSelector !== undefined) {
    if (rawRule.textSelector !== undefined) {
      return {
        aSelector: rawRule.aSelector,
        textSelector: rawRule.textSelector,
      };
    }
    return { aSelector: rawRule.aSelector };
  }
  if (rawRule.textSelector !== undefined) {
    return { textSelector: rawRule.textSelector };
  }
  // 理论上不会触发：schema 已用 check 保证至少存在一个选择器
  throw new Error("[rules] aSelector/textSelector 缺失，无法归一化规则");
}

function normalizeRuleBase(rawRule: RawRuleBase): NormalizedRuleBase {
  return {
    name: rawRule.name,
    styleScope: rawRule.styleScope,
    ...normalizeSelectors(rawRule),
    ...(rawRule.fontSize !== undefined ? { fontSize: rawRule.fontSize } : {}),
  };
}

function normalizeStaticRule(
  rawRule: Extract<RawRule, { injectMode: InjectionMode.Static }>,
): StaticPageRule {
  return {
    ...normalizeRuleBase(rawRule),
    injectMode: InjectionMode.Static,
    textSource: "self",
    ignoreProcessed: false,
    matchByName: false,
  };
}

function normalizeDynamicRule(
  rawRule: Extract<RawRule, { injectMode: InjectionMode.Dynamic }>,
): DynamicPageRule {
  return {
    ...normalizeRuleBase(rawRule),
    injectMode: InjectionMode.Dynamic,
    textSource: rawRule.textSource ?? "self",
    ignoreProcessed: false,
    matchByName: rawRule.matchByName ?? false,
    dynamicWatch: rawRule.dynamicWatch ?? false,
    trigger: {
      watch: rawRule.trigger.watch,
      debounceMs: rawRule.trigger.interval,
    },
  };
}

function normalizePollingRule(
  rawRule: Extract<RawRule, { injectMode: InjectionMode.Polling }>,
): PollingPageRule {
  return {
    ...normalizeRuleBase(rawRule),
    injectMode: InjectionMode.Polling,
    textSource: rawRule.textSource ?? "self",
    ignoreProcessed: rawRule.ignoreProcessed ?? false,
    matchByName: rawRule.matchByName ?? false,
    trigger: {
      watch: rawRule.trigger.watch,
      intervalMs: rawRule.trigger.interval,
    },
  };
}

function normalizeRule(rawRule: RawRule): PageRule {
  if (rawRule.injectMode === InjectionMode.Static) {
    return normalizeStaticRule(rawRule);
  }
  if (rawRule.injectMode === InjectionMode.Dynamic) {
    return normalizeDynamicRule(rawRule);
  }
  return normalizePollingRule(rawRule);
}

function normalizeEntry(entry: RawRuleEntry): RuleConfigEntry {
  return {
    urlPattern: entry.urlPattern,
    rule: normalizeRule(entry.rule),
  };
}

/**
 * 规则配置使用数组而不是 Map：
 * - 同一个 URL 正则可以声明多条规则
 * - 避免 Map 键唯一语义造成“后写覆盖前写”的误解
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

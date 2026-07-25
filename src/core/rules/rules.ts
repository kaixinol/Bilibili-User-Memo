import { getOpusAuthorUid, getUidFromVueInstance } from "@/core/dom/uid-extractor";
import { type RawConfig, StyleScope } from "./rule-types";
import { logger } from "@/utils/logger";
import { waitUntil } from "@/utils/scheduler";

export { StyleScope, InjectionMode } from "./rule-types";
const COMMON_REG = /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/;
const VIDEO_REG = /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/;


const rawConfig: RawConfig[] = [
    {
        urlPattern: VIDEO_REG,
        rule: { name: "视频页面", styleScope: StyleScope.Editable, aSelector: ".up-name" }
    },
    {
        urlPattern: VIDEO_REG,
        rule: { name: "视频页面-Staff", styleScope: StyleScope.Minimal, aSelector: "a.staff-name" }
    },
    {
        urlPattern: VIDEO_REG,
        rule: {
            name: "视频页面-推荐",
            styleScope: StyleScope.Minimal,
            aSelector: ".upname a",
            textSelector: "span.name",
            trigger: { watch: ".rcmd-tab", interval: 1000 }
        }
    },
    {
        urlPattern: /^https:\/\/space\.bilibili\.com\/.*/,
        rule: { name: "空间", styleScope: StyleScope.Editable, aSelector: ".nickname" }
    },
    {
        urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/relation\/(follow|fans)(?:[/?#].*)?$/,
        rule: {
            name: "空间关注/粉丝",
            styleScope: StyleScope.Editable,
            aSelector: "a.relation-card-info__uname",
            trigger: { watch: "main.space-main", interval: 1000 },
        }
    },
    {
        urlPattern:
            /^https:\/\/space\.bilibili\.com\/\d+\/favlist\?(?=[^#]*\bfid=\d+\b)(?=[^#]*\bftype=create\b)[^#]*(?:#.*)?$/,
        rule: {
            name: "空间收藏夹",
            styleScope: StyleScope.Minimal,
            aSelector: ".bili-video-card__author",
            textSelector: ".bili-video-card__text span[title]",
            trigger: { watch: ".favlist-main", interval: 1000 },
        }
    },
    {
        urlPattern:
            /^https:\/\/www\.bilibili\.com\/watchlater\/list(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "稍后再看",
            styleScope: StyleScope.Minimal,
            aSelector: ".bili-video-card__author",
            textSelector: ".bili-video-card__text span[title]",
            trigger: { watch: "body", interval: 1000 },
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "首页",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
            textSelector:
                ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
            trigger: { watch: "#app", interval: 1000 },
        }
    },
    {
        urlPattern: /^https:\/\/search\.bilibili\.com\/(all|video|article)/,
        rule: {
            name: "搜索",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".bili-video-card__info--owner, .bili-video-card__author, a.up-name, a.flex_start.flex_inline",
            textSelector:
                ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text, span.lh_xs",
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/v\/popular\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "热门",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
            textSelector:
                ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
            trigger: { watch: "#app", interval: 1000 },
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/v\/[a-z]+\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "分区",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
            textSelector:
                ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
            trigger: { watch: "#app", interval: 1000 },
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/c\/[a-z0-9_-]+\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "频道",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".bili-video-card__info--owner, .bili-video-card__author, a.up-name",
            textSelector:
                ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text",
            trigger: { watch: "#app", interval: 1000 },
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "评论区",
            styleScope: StyleScope.Editable,
            aSelector: "#user-name a",
            trigger: { watch: "div#contents", interval: 1000 },
            dynamicWatch: true
        }
    },
    {
        urlPattern: /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
        rule: {
            name: "私信-侧边栏",
            styleScope: StyleScope.Minimal,
            aSelector: 'div[data-id^="contact"]',
            textSelector: 'div[class*="_SessionItem__Name"]',
            trigger: { watch: 'div[class^="_Sidebar_"]', interval: 1000 },
            uidResolver: (el) =>
                el.closest('[data-id^="contact_"]')?.getAttribute("data-id")?.split("_")?.[1] || null,
        }
    },
    {
        urlPattern: /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
        rule: {
            name: "私信-当前",
            styleScope: StyleScope.Minimal,
            textSelector: 'div[class^="_ContactName_"]',
            trigger: { watch: 'div[class^="_ChatHeader_"]', interval: 1000 },
            uidResolver: () => location.href.match(/#\/whisper\/mid(\d+)/)?.[1] || null,
            originalNameResolver: () => {
                const uid = location.href.match(/#\/whisper\/mid(\d+)/)?.[1];
                if (!uid) return null;
                const sessionName = document
                    .querySelector(`[data-id="contact_${uid}"] div[class*="_SessionItem__Name"]`) as
                    | HTMLElement
                    | null;
                return (
                    sessionName?.dataset.bilimemoOriginal?.trim() ||
                    sessionName?.textContent?.trim() ||
                    null
                );
            },
        }
    },
    {
        urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic\/*/,
        rule: {
            name: "个人空间动态",
            styleScope: StyleScope.Minimal,
            aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
            trigger: { watch: ".bili-dyn-list", interval: 1000 },
        }
    },
    {
        urlPattern:
            /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?(?:reply|love|at)(?:\/|$)/,
        rule: {
            name: "回复/赞/AT",
            styleScope: StyleScope.Minimal,
            aSelector: "a.interaction-item__uname",
            trigger: { watch: "div.message-content", interval: 1000 },
        }
    },
    {
        urlPattern: /^https:\/\/t\.bilibili\.com\/.*/,
        rule: {
            name: "动态页",
            styleScope: StyleScope.Editable,
            textSelector: "span.bili-dyn-title__text",
            trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
            dynamicWatch: true,
            uidResolver: (el) => {
                return getUidFromVueInstance(el.parentElement!)
            }
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "动态正文-提及",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".opus-paragraph-children p a[href*='space.bilibili.com']",
            trigger: { watch: "div.bili-dyn-item__main", interval: 1000 },
            dynamicWatch: true,
        }
    },
    // 弹出层规则
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-UP动态",
            styleScope: StyleScope.Editable,
            aSelector: "div.user-name a",
            trigger: { watch: "div.header-content-panel", interval: 1000 },
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-收藏夹",
            styleScope: StyleScope.Minimal,
            aSelector: "span.header-fav-card__info--name",
            textSelector: "span.header-fav-card__info--name span",
            trigger: { watch: "div.favorite-panel-popover", interval: 1000 },
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-历史",
            styleScope: StyleScope.Editable,
            textSelector: "div.header-history-card__info--name span",
            trigger: { watch: "div.history-panel-popover", interval: 1000 },
            matchByName: true,
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-正在直播",
            styleScope: StyleScope.Minimal,
            aSelector: "a.up-item",
            textSelector: "div.up-name",
            trigger: { watch: "div.living-up-list", interval: 1000 },
            matchByName: true, // 因为直播间ID不是UID
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/opus\/\d+/,
        rule: {
            name: "新版动态",
            styleScope: StyleScope.Editable,
            aSelector: "div.opus-module-author__name",
            uidResolver: async (el) => {
                let rawUid = getOpusAuthorUid(el);
                if (!rawUid) {
                    await waitUntil(() => Boolean(getOpusAuthorUid(el)), {
                        intervalMs: 200,
                        timeoutMs: 10000,
                    });
                    rawUid = getOpusAuthorUid(el);
                }
                logger.debug("rawUid", rawUid);
                return rawUid;
            }
        }
    },
    {
        urlPattern: /^https:\/\/t\.bilibili\.com\/\d+/,
        rule: {
            name: "动态-转发",
            styleScope: StyleScope.Minimal,
            aSelector: "span.dyn-orig-author__name",
            uidResolver: el => {
                return (el as any)._profile.uid;
            }
        }
    }, {
        urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic/,
        rule: {
            name: "用户空间动态-转发",
            styleScope: StyleScope.Minimal,
            aSelector: "span.dyn-orig-author__name",
            trigger: { watch: "bili-dyn-content__orig", interval: 1000 },
            dynamicWatch: true,
            uidResolver: el => {
                return (el as any)._profile.uid;
            }
        }
    },
    {
        urlPattern: /^https:\/\/space\.bilibili\.com\/\d+\/dynamic/,
        rule: {
            name: "用户空间动态-点赞",
            styleScope: StyleScope.Minimal,
            aSelector: 'span[data-module="desc"]',
            trigger: { watch: "div.bili-dyn-interaction__item", interval: 1000 },
            dynamicWatch: true,
        }
    }, {
        urlPattern: /^https:\/\/search\.bilibili\.com\/(all|live|upuser)/,
        rule: {
            name: "搜索页面-UP主",
            styleScope: StyleScope.Editable,
            aSelector: "a.user-name, a.p_relative, a.live-title",
        }
    }, {
        urlPattern: VIDEO_REG,
        rule: { name: "视频简介-提及", styleScope: StyleScope.Minimal, aSelector: '.basic-desc-info a.mention-user' }
    },
    {
        urlPattern: COMMON_REG,
        rule: { name: "全站-提及", styleScope: StyleScope.Minimal, aSelector: 'a[data-type="mention"]' }
    }, {
        urlPattern: /https:\/\/www\.bilibili\.com\/history/,
        rule: {
            name: "历史记录",
            styleScope: StyleScope.Minimal,
            aSelector: 'a.bili-video-card__author',
            textSelector: "div.bili-video-card__text span:not(:empty)"
        }
    }
];
export const config = rawConfig;

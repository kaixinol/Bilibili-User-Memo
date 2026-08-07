import { getOpusAuthorUid, getUidFromVueInstance } from "@/core/dom/uid-extractor";
import { type RawConfig, StyleScope } from "./rule-types";

export { StyleScope, } from "./rule-types";
const COMMON_REG = /^https:\/\/[a-z0-9.]+\.bilibili\.com\/.*/;
const VIDEO_REG = /^https:\/\/www\.bilibili\.com\/(video|list)\/.*/;

const VIDEO_CARD_A_SELECTOR = ".bili-video-card__info--owner:not(:has(.bili-video-card__info--ad)), .bili-video-card__author, a.up-name";
const VIDEO_CARD_TEXT_SELECTOR = ".bili-video-card__info--author, .bili-video-card__text span[title], .up-name__text";
const NEW_DYNAMIC_OPUS_ONE = /^https:\/\/www\.bilibili\.com\/opus\/\d+/
const USER_SPACE_DYNAMIC = /^https:\/\/space\.bilibili\.com\/\d+\/dynamic/;
const DYNAMIC_PAGE = /^https:\/\/t\.bilibili\.com\/(?:\?[^#]*)?$/;
const OLD_DYNAMIC_PAGE = /^https:\/\/t\.bilibili\.com\/\d+(?:\?[^#]*)?(?:#.*)?$/;
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
            container: "div.rec-list"
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
            container: "main.space-main",
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
            container: ".favlist-main",
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
            container: "body",
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "首页",
            styleScope: StyleScope.Minimal,
            aSelector: VIDEO_CARD_A_SELECTOR,
            textSelector: VIDEO_CARD_TEXT_SELECTOR,
            container: "#app",
        }
    },
    {
        urlPattern: /^https:\/\/search\.bilibili\.com\/(all|video|article)/,
        rule: {
            name: "搜索",
            styleScope: StyleScope.Minimal,
            aSelector: `${VIDEO_CARD_A_SELECTOR}, a.flex_start.flex_inline`,
            textSelector: `${VIDEO_CARD_TEXT_SELECTOR}, span.lh_xs`,
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/v\/popular\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "热门",
            styleScope: StyleScope.Minimal,
            aSelector: VIDEO_CARD_A_SELECTOR,
            textSelector: VIDEO_CARD_TEXT_SELECTOR,
            container: "#app",
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/v\/[a-z]+\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "分区",
            styleScope: StyleScope.Minimal,
            aSelector: VIDEO_CARD_A_SELECTOR,
            textSelector: VIDEO_CARD_TEXT_SELECTOR,
            container: "#app",
        }
    },
    {
        urlPattern: /^https:\/\/www\.bilibili\.com\/c\/[a-z0-9_-]+\/?(?:\?[^#]*)?(?:#.*)?$/,
        rule: {
            name: "频道",
            styleScope: StyleScope.Minimal,
            aSelector: VIDEO_CARD_A_SELECTOR,
            textSelector: VIDEO_CARD_TEXT_SELECTOR,
            container: "#app",
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "评论区",
            styleScope: StyleScope.Editable,
            aSelector: "#user-name a",
            container: "div#info",
        }
    },
    {
        urlPattern: /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?whisper(?:\/|$)/,
        rule: {
            name: "私信-侧边栏",
            styleScope: StyleScope.Minimal,
            aSelector: 'div[data-id^="contact"]',
            textSelector: 'div[class*="_SessionItem__Name"]',
            container: 'div[class^="_Sidebar_"]',
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
            container: 'div[class^="_ChatHeader_"]',
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
        urlPattern: USER_SPACE_DYNAMIC,
        rule: {
            name: "个人空间动态",
            styleScope: StyleScope.Minimal,
            aSelector: "div.bili-dyn-title span.bili-dyn-title__text",
            container: ".bili-dyn-list",
        }
    },
    {
        urlPattern:
            /^https:\/\/message\.bilibili\.com\/(?:[^#]*)?(?:#\/)?(?:reply|love|at)(?:\/|$)/,
        rule: {
            name: "回复/赞/AT",
            styleScope: StyleScope.Minimal,
            aSelector: "a.interaction-item__uname",
            container: "div.message-content",
        }
    },
    {
        urlPattern: DYNAMIC_PAGE,
        rule: {
            name: "动态页（所有动态）",
            styleScope: StyleScope.Editable,
            textSelector: "span.bili-dyn-title__text",
            container: "div.bili-dyn-item__main",
            uidResolver: (el) => {
                return getUidFromVueInstance(el.parentElement!)
            }
        }
    },
    {
        urlPattern: new RegExp(`${USER_SPACE_DYNAMIC.source}|${NEW_DYNAMIC_OPUS_ONE.source}|${DYNAMIC_PAGE.source}|${OLD_DYNAMIC_PAGE.source}`),
        rule: {
            name: "动态正文-提及",
            styleScope: StyleScope.Minimal,
            aSelector:
                ".opus-paragraph-children p a[href*='space.bilibili.com']",
        }
    },
    // 弹出层规则
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-UP动态",
            styleScope: StyleScope.Editable,
            aSelector: "div.user-name a",
            container: "div.header-content-panel",
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-收藏夹",
            styleScope: StyleScope.Minimal,
            aSelector: "span.header-fav-card__info--name",
            textSelector: "span.header-fav-card__info--name span",
            container: "div.favorite-panel-popover",
        }
    },
    {
        urlPattern: COMMON_REG,
        rule: {
            name: "最近-历史",
            styleScope: StyleScope.Editable,
            textSelector: "div.header-history-card__info--name span",
            container: "div.history-panel-popover",
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
            container: "div.living-up-list",
            matchByName: true, // 因为直播间ID不是UID
        }
    },
    {
        urlPattern: NEW_DYNAMIC_OPUS_ONE,
        rule: {
            name: "动态（新）",
            styleScope: StyleScope.Editable,
            aSelector: "div.opus-module-author__name",
            uidResolver: el => {
                return getOpusAuthorUid(el);
            }
        }
    },
    {
        urlPattern: OLD_DYNAMIC_PAGE,
        rule: {
            name: "动态（旧）",
            styleScope: StyleScope.Minimal,
            textSelector: "span.bili-dyn-title__text",
            uidResolver: el => {
                return getUidFromVueInstance((el as HTMLSpanElement).parentElement);
            }
        }
    }, {
        urlPattern: USER_SPACE_DYNAMIC,
        rule: {
            name: "用户空间动态-转发",
            styleScope: StyleScope.Minimal,
            textSelector: "span.dyn-orig-author__name",
            container: "div.dyn-orig-author",
            uidResolver: el => {
                return getOpusAuthorUid(el);
            }
        }
    },
    {
        urlPattern: USER_SPACE_DYNAMIC,
        rule: {
            name: "用户空间动态-点赞",
            styleScope: StyleScope.Minimal,
            aSelector: 'span[data-module="desc"]',
            container: "div.bili-dyn-interaction__item",
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
        urlPattern: VIDEO_REG,
        rule: { name: "视频-提及", styleScope: StyleScope.Minimal, aSelector: 'a[data-type="mention"]' }
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

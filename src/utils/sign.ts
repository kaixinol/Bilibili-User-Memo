// rewritten from SocialSisterYi/bilibili-API-collect/docs/misc/sign/wbi.md#javascript
import GM_fetch from "@trim21/gm-fetch";
import { logger } from "./logger";
import { withLimit } from "./limiter";
import {
  GM_setValue,
  GM_getValue,
  GM_xmlhttpRequest,
} from "vite-plugin-monkey/dist/client";
if (typeof GM === "undefined") {
  (window as any).GM = {
    xmlHttpRequest: GM_xmlhttpRequest,
  };
}
// --- 常量定义 ---
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

const CACHE_KEY = "bili_wbi_keys";
const CACHE_TTL = 3600 * 1000; // 1小时缓存时间
const md5 = (message: string): string => {
  const buffer = new TextEncoder().encode(message);
  const n = buffer.length;

  // 更加语义化的字数组初始化
  const words = new Uint32Array((((n + 8) >> 6) + 1) << 4);
  for (let i = 0; i < n; i++) words[i >> 2] |= buffer[i] << ((i % 4) * 8);
  words[n >> 2] |= 0x80 << ((n % 4) * 8);
  words[words.length - 2] = n * 8;

  let [a, b, c, d] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];

  // 预计算常量（可以在模块级缓存以提升性能）
  const K = Uint32Array.from(
    { length: 64 },
    (_, i) => (Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0,
  );
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  for (let i = 0; i < words.length; i += 16) {
    let [A, B, C, D] = [a, b, c, d];

    for (let j = 0; j < 64; j++) {
      let f, g;
      if (j < 16) {
        f = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        f = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        f = C ^ (B | ~D);
        g = (7 * j) % 16;
      }

      const temp = D;
      D = C;
      C = B;
      // 使用 | 0 强制进行 32 位有符号运算，有助于引擎优化
      const x = (A + f + K[j] + words[i + g]) | 0;
      B = (B + rotl(x, S[j])) | 0;
      A = temp;
    }
    a = (a + A) | 0;
    b = (b + B) | 0;
    c = (c + C) | 0;
    d = (d + D) | 0;
  }

  // 使用 DataView 优雅地输出小端序十六进制
  const outBuf = new ArrayBuffer(16);
  const view = new DataView(outBuf);
  [a, b, c, d].forEach((val, i) => view.setUint32(i * 4, val, true));

  return Array.from(new Uint8Array(outBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
interface WbiCache {
  img_key: string;
  sub_key: string;
  timestamp: number;
}

interface UserInfo {
  readonly avatar: string;
  readonly nickname: string;
}

// --- 工具函数 ---

/**
 * 对 imgKey 和 subKey 进行字符顺序打乱编码
 */
const getMixinKey = (orig: string) =>
  MIXIN_KEY_ENC_TAB.map((n) => orig[n])
    .join("")
    .slice(0, 32);

/**
 * 获取最新的 img_key 和 sub_key (带缓存逻辑)
 */
async function getWbiKeys(): Promise<{ img_key: string; sub_key: string }> {
  const now = Date.now();
  const cache = GM_getValue(CACHE_KEY, null) as WbiCache | null;

  // 检查缓存是否存在且未过期
  if (cache && now - cache.timestamp < CACHE_TTL) {
    return { img_key: cache.img_key, sub_key: cache.sub_key };
  }

  try {
    const res = await GM_fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: { Referer: "https://www.bilibili.com/" },
    });
    const json = await res.json();
    const { img_url, sub_url } = json.data.wbi_img;

    const keys = {
      img_key: img_url.slice(
        img_url.lastIndexOf("/") + 1,
        img_url.lastIndexOf("."),
      ),
      sub_key: sub_url.slice(
        sub_url.lastIndexOf("/") + 1,
        sub_url.lastIndexOf("."),
      ),
    };

    // 写入缓存
    GM_setValue(CACHE_KEY, { ...keys, timestamp: now });
    return keys;
  } catch (err) {
    logger.error("Failed to fetch WBI keys", err);
    throw new Error("WBI key 初始化失败");
  }
}

/**
 * 为请求参数进行 wbi 签名
 */
/**
 * 为请求参数进行 wbi 签名
 */
function encWbi(
  params: Record<string, any>,
  img_key: string,
  sub_key: string,
): string {
  const mixin_key = getMixinKey(img_key + sub_key);
  const curr_time = Math.round(Date.now() / 1000);
  const chr_filter = /[!'()*]/g;

  // 1. 添加时间戳并克隆参数
  // 使用 Record<string, any> 显式声明类型，允许字符串索引
  const signedParams: Record<string, any> = { ...params, wts: curr_time };

  // 2. 按照 key 重排并过滤特殊字符
  // 使用 Object.entries 直接解构 [key, value]，避开索引类型检查问题
  const query = Object.entries(signedParams)
    .sort(([a], [b]) => a.localeCompare(b)) // 按 key 排序
    .map(([key, value]) => {
      // 过滤 value 中的 "!'()*" 字符
      const filteredValue = String(value).replace(chr_filter, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(filteredValue)}`;
    })
    .join("&");

  // 3. 计算 w_rid
  const wbi_sign = md5(query + mixin_key);

  return `${query}&w_rid=${wbi_sign}`;
}

// --- 主逻辑 ---

async function _getUserInfo(mid: string): Promise<UserInfo> {
  try {
    const { img_key, sub_key } = await getWbiKeys();

    const params = {
      mid: mid,
      token: "",
      platform: "web",
      web_location: 1550101, // 个人空间
    };

    const signedQuery = encWbi(params, img_key, sub_key);
    const url = `https://api.bilibili.com/x/space/wbi/acc/info?${signedQuery}`;

    const response = await GM_fetch(url, {
      headers: { Referer: "https://space.bilibili.com/" },
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const res = await response.json();

    if (res.code !== 0) {
      throw new Error(`Bilibili API error: ${res.message}`);
    }

    return {
      nickname: res.data.name,
      avatar: res.data.face + "@96w_96h_1c_1s.avif",
    };
  } catch (error) {
    logger.error("getUserInfo failed", error);
    throw error;
  }
}

const cache = new Map<string, { data: any; time: number }>();

function withSmartCache<T extends (...args: any[]) => Promise<any>>(fn: T): T {
  return (async (...args: any[]) => {
    const key = JSON.stringify(args);
    const now = Date.now();

    // 5分钟内如果查过同一个 ID，直接给缓存，不发请求
    if (cache.has(key) && now - cache.get(key)!.time < 300000) {
      return cache.get(key)!.data;
    }

    const result = await fn(...args);
    cache.set(key, { data: result, time: now });
    return result;
  }) as T;
}

/**
 * 获取用户信息
 * @param mid 用户UID
 */
export const getUserInfo = withSmartCache(withLimit(_getUserInfo));

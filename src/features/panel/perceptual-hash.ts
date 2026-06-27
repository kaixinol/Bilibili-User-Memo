import GM_fetch from "@trim21/gm-fetch";
import { DEFAULT_AVATAR_URL, isNoFaceAvatar } from "@/core/dom/dom-utils";
import { logger } from "@/utils/logger";

const HASH_SIZE = 16;
const DISTANCE_THRESHOLD = 20;
const IMAGE_SCALE = 64;

console.debug(GM.xmlHttpRequest)
function bmvbhash(
  { data, width, height }: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  bits = HASH_SIZE,
): string {
  const blockX = width / bits, blockY = height / bits;
  const len = bits * bits;
  const blocks = new Float32Array(len), counts = new Float32Array(len);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const pixelIdx = i / 4;
    const x = pixelIdx % width;
    const y = Math.floor(pixelIdx / width);
    const bX = Math.floor(x / blockX), bY = Math.floor(y / blockY);
    if (bX < bits && bY < bits) {
      const blockIdx = bY * bits + bX;
      blocks[blockIdx] += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      counts[blockIdx]++;
    }
  }

  let total = 0, count = 0;
  for (let i = 0; i < len; i++) {
    if (counts[i] > 0) {
      total += (blocks[i] /= counts[i]);
      count++;
    }
  }
  const avg = total / count;

  let hashStr = "", currentByte = 0;
  for (let i = 0; i < len; i++) {
    currentByte = (currentByte << 1) | (blocks[i] >= avg ? 1 : 0);
    if ((i + 1) % 4 === 0) {
      hashStr += currentByte.toString(16);
      currentByte = 0;
    }
  }
  return hashStr;
}

function hammingDistance(h1: string, h2: string): number {
  return h1.length !== h2.length
    ? 999
    : [...h1].reduce((dist, char, i) => dist + (char !== h2[i] ? 1 : 0), 0);
}

function normalizeUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

function stripImageSuffix(url: string): string {
  const atIdx = url.indexOf("@");
  return atIdx !== -1 ? url.slice(0, atIdx) : url;
}

const urlHashCache = new Map<string, string | null>();
let nofaceHash: string | null = null;

async function loadImageHash(url: string): Promise<string | null> {
  const cached = urlHashCache.get(url);
  if (cached !== undefined) {
    logger.debug(`[perceptual-hash] 缓存命中: ${url} -> ${cached}`);
    return cached;
  }

  try {
    const fetchUrl = normalizeUrl(stripImageSuffix(url));
    logger.debug(`[perceptual-hash] 请求图片: ${url} -> ${fetchUrl}`);
    const response = await GM_fetch(fetchUrl);
    if (!response.ok) {
      logger.debug(`[perceptual-hash] 请求失败: ${fetchUrl} status=${response.status}`);
      return null;
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Image load failed"));
        image.src = objectUrl;
      });
      const canvas = document.createElement("canvas");
      canvas.width = IMAGE_SCALE;
      canvas.height = IMAGE_SCALE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, IMAGE_SCALE, IMAGE_SCALE);
      const hash = bmvbhash(ctx.getImageData(0, 0, IMAGE_SCALE, IMAGE_SCALE));
      logger.debug(`[perceptual-hash] 计算完成: ${url} -> ${hash}`);
      urlHashCache.set(url, hash);
      return hash;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch (error) {
    logger.debug(`[perceptual-hash] 加载异常: ${url}`, error);
    return null;
  }
}

async function getNofaceHash(): Promise<string | null> {
  if (nofaceHash) return nofaceHash;
  const hash = await loadImageHash(DEFAULT_AVATAR_URL);
  if (hash) nofaceHash = hash;
  return hash;
}

export async function isFakeNoFaceAvatar(avatarUrl: string): Promise<boolean> {
  if (!avatarUrl || isNoFaceAvatar(avatarUrl)) {
    logger.debug(`[perceptual-hash] 跳过: 空URL或真noface, url=${avatarUrl}`);
    return false;
  }
  const refHash = await getNofaceHash();
  if (!refHash) {
    logger.debug("[perceptual-hash] noface参考哈希获取失败");
    return false;
  }
  const avatarHash = await loadImageHash(avatarUrl);
  if (!avatarHash) {
    logger.debug(`[perceptual-hash] 用户头像哈希获取失败: ${avatarUrl}`);
    return false;
  }
  const distance = hammingDistance(refHash, avatarHash);
  const isFake = distance <= DISTANCE_THRESHOLD;
  logger.debug(`[perceptual-hash] 比对结果: distance=${distance}, threshold=${DISTANCE_THRESHOLD}, isFake=${isFake}, url=${avatarUrl}`);
  return isFake;
}

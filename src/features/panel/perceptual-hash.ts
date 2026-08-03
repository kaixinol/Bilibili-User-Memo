import { logger } from "@/utils/logger";

const HASH_SIZE = 16;
const DISTANCE_THRESHOLD = 20;
const IMAGE_SCALE = 32;

const NOFACE_HASH = "fffffffffffffddff81fe007eff7edb7e997ee77eff7e007fc3ff81ff81ff80f";

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
  if (h1.length !== h2.length) return 999;

  let distance = 0;

  for (let i = 0; i < h1.length; i++) {
    const xor =
      parseInt(h1[i], 16) ^
      parseInt(h2[i], 16);

    // 统计 xor 中有多少个 bit 为 1
    distance += xor.toString(2).replaceAll("0", "").length;
  }

  return distance;
}
function hashFromImage(img: HTMLImageElement): string | null {
  try {
    const canvas = new OffscreenCanvas(
      IMAGE_SCALE,
      IMAGE_SCALE
    );

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, IMAGE_SCALE, IMAGE_SCALE);

    const imageData = ctx.getImageData(
      0,
      0,
      IMAGE_SCALE,
      IMAGE_SCALE
    );

    return bmvbhash(imageData);
  } catch (error) {
    logger.debug("[perceptual-hash] 图片读取失败", error);
    return null;
  }
}

export function isFakeNoFaceAvatarFromImg(img: HTMLImageElement): boolean {
  if (!img || !img.complete || !img.naturalWidth) {
    logger.debug("[perceptual-hash] 图片未加载完成");
    return false;
  }
  const avatarHash = hashFromImage(img);
  if (!avatarHash) {
    logger.debug("[perceptual-hash] 用户头像哈希获取失败");
    return false;
  }
  const distance = hammingDistance(NOFACE_HASH, avatarHash);
  const isFake = distance <= DISTANCE_THRESHOLD;
  logger.debug(`[perceptual-hash] 比对结果: distance=${distance}, threshold=${DISTANCE_THRESHOLD}, isFake=${isFake}, src=${img.src}`);
  return isFake;
}

import { getGmValue, setGmValue } from "./gm-storage";

interface TimestampedRecord {
  timestamp: number;
}

export function getFreshGmCache<T extends TimestampedRecord>(
  key: string,
  ttlMs: number,
): T | null {
  const cache = getGmValue<T | null>(key, null);
  if (!cache) return null;
  if (Date.now() - cache.timestamp >= ttlMs) return null;
  return cache;
}

export function setTimestampedGmCache<T extends object>(
  key: string,
  value: T,
  timestamp = Date.now(),
): T & TimestampedRecord {
  const cachedValue = { ...value, timestamp };
  setGmValue(key, cachedValue);
  return cachedValue;
}

export function withMemoryCache<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  {
    ttlMs,
    getKey = (...args: Args) => JSON.stringify(args),
  }: {
    ttlMs: number;
    getKey?: (...args: Args) => string;
  },
): (...args: Args) => Promise<Result> {
  const cache = new Map<string, { value: Result; timestamp: number }>();

  return async (...args: Args) => {
    const cacheKey = getKey(...args);
    const cached = cache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < ttlMs) {
      return cached.value;
    }

    const value = await fn(...args);
    cache.set(cacheKey, { value, timestamp: now });
    return value;
  };
}

/**
 * 字体大小检测缓存
 * 使用元素的类名/ID组合作为缓存键，避免重复调用 getComputedStyle
 */
class FontSizeCache {
  private cache = new Map<string, string>();

  /**
   * 生成缓存键：基于元素的类名和ID
   * 例如: "user-name.sub-name" 或 "#unique-id.class1.class2"
   */
  private generateCacheKey(element: HTMLElement): string {
    const parts: string[] = [];
    
    // 添加 ID（如果存在）
    if (element.id) {
      parts.push(`#${element.id}`);
    }
    
    // 添加类名（按字母排序以保证一致性）
    if (element.className && typeof element.className === 'string') {
      const classes = element.className
        .split(/\s+/)
        .filter(Boolean)
        .sort();
      if (classes.length > 0) {
        parts.push(classes.join('.'));
      }
    }
    
    // 如果既没有ID也没有类名，使用标签名作为后备
    if (parts.length === 0) {
      parts.push(element.tagName.toLowerCase());
    }
    
    return parts.join('');
  }

  /**
   * 获取或检测字体大小
   * @param element 目标元素
   * @returns 计算后的字体大小（如 "14px"）
   */
  getOrDetect(element: HTMLElement): string {
    const cacheKey = this.generateCacheKey(element);
    
    // 尝试从缓存读取
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // 缓存未命中，执行实际检测
    const computedStyle = getComputedStyle(element);
    const fontSize = computedStyle.fontSize;
    
    // 写入缓存
    this.cache.set(cacheKey, fontSize);
    
    return fontSize;
  }

  /**
   * 清除缓存（用于调试或强制刷新）
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计信息
   */
  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// 导出单例实例
export const fontSizeCache = new FontSizeCache();

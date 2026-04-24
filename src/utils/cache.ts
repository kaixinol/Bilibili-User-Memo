import { getGmValue, setGmValue } from "./gm-storage";
import { logger } from "./logger";

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
 * 使用规则的 aSelector + textSelector 组合作为缓存键，避免重复调用 getComputedStyle
 */
class FontSizeCache {
  private cache = new Map<string, string>();

  /**
   * 生成缓存键：基于规则的 aSelector 和 textSelector
   * 
   * 策略（按优先级）：
   * 1. 优先使用 aSelector（锚点选择器，最稳定）
   * 2. 其次使用 textSelector（文本选择器）
   * 3. 最后使用元素的类名+ID组合作为后备
   * 
   * 示例：
   * - aSelector=".user-name", textSelector=".nickname" → "a:.user-name|t:.nickname"
   * - aSelector=".up-name" → "a:.up-name"
   * - 无规则信息时 → "class:user.name" 或 "id:main.class:container"
   */
  private generateCacheKey(element: HTMLElement, rule?: any): string {
    // 如果提供了规则信息，优先使用规则的选择器
    if (rule) {
      const parts: string[] = [];
      
      if (rule.aSelector) {
        parts.push(`a:${rule.aSelector}`);
      }
      
      if (rule.textSelector) {
        parts.push(`t:${rule.textSelector}`);
      }
      
      if (parts.length > 0) {
        return parts.join('|');
      }
    }
    
    // 回退方案：使用元素的类名和ID组合
    const fallbackParts: string[] = [];
    
    // 添加 ID（如果存在）
    if (element.id) {
      fallbackParts.push(`id:${element.id}`);
    }
    
    // 添加类名（按字母排序以保证一致性）
    if (element.className && typeof element.className === 'string') {
      const classes = element.className
        .split(/\s+/)
        .filter(Boolean)
        .sort();
      if (classes.length > 0) {
        fallbackParts.push(`class:${classes.join('.')}`);
      }
    }
    
    // 如果既没有ID也没有类名，不再使用标签名，返回空字符串表示无法缓存
    if (fallbackParts.length === 0) {
      logger.debug('[FontCache]', element.tagName, '→', '(no cache key)');
      return '';
    }
    
    return fallbackParts.join('.');
  }

  /**
   * 获取或检测字体大小
   * @param element 目标元素
   * @param rule 可选的规则对象，用于提取 aSelector/textSelector
   * @returns 计算后的字体大小（如 "14px"），如果无法生成缓存键则返回 null
   */
  getOrDetect(element: HTMLElement, rule?: any): string | null {
    const cacheKey = this.generateCacheKey(element, rule);
    
    // 如果无法生成有效的缓存键，直接检测但不缓存
    if (!cacheKey) {
      const computedStyle = getComputedStyle(element);
      const fontSize = computedStyle.fontSize;
      return fontSize;
    }
    
    // 尝试从缓存读取
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug('[FontCache] ✓', cacheKey, '=', cached);
      return cached;
    }
    
    // 缓存未命中，执行实际检测
    const computedStyle = getComputedStyle(element);
    const fontSize = computedStyle.fontSize;
    
    // 写入缓存
    this.cache.set(cacheKey, fontSize);
    logger.debug('[FontCache] ✗', cacheKey, '→', fontSize);
    
    return fontSize;
  }
}

// 导出单例实例
export const fontSizeCache = new FontSizeCache();

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

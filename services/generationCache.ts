const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_PREFIX = 'gen_cache_';

interface CacheEntry {
  value: string;
  expiry: number;
}

function readEntry(key: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() > entry.expiry) {
      sessionStorage.removeItem(key);
      return null;
    }
    return entry;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

/** Simple FNV-1a hash for cache keys */
function hashKey(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function getCacheKey(question: string, contextFileName?: string, removePlagiarism?: boolean, temperature?: number): string {
  const raw = `${question}|${contextFileName || ''}|${!!removePlagiarism}|${temperature ?? 0.5}`;
  return CACHE_PREFIX + hashKey(raw);
}

export function getCached(key: string): string | null {
  return readEntry(key)?.value ?? null;
}

export function getCachedJson<T>(
  key: string,
  validator: (value: unknown) => value is T,
): T | null {
  const value = readEntry(key)?.value;
  if (!value) return null;

  try {
    const parsed: unknown = JSON.parse(value);
    if (!validator(parsed)) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    sessionStorage.removeItem(key);
    return null;
  }
}

export function setCache(key: string, value: string): void {
  try {
    const entry: CacheEntry = { value, expiry: Date.now() + CACHE_TTL_MS };
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // sessionStorage full or unavailable — silently ignore
  }
}

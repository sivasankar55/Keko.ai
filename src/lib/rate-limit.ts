import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rate limiter with graceful fallback.
 * - If Upstash env vars exist, uses sliding window in Redis (durable, multi-instance safe).
 * - Otherwise uses in-memory limits (fine for local dev).
 */

type Bucket = { count: number; reset: number };
const memory: Map<string, Bucket> = (globalThis as any).__rl ?? new Map();
(globalThis as any).__rl = memory;

function memoryLimiter(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const b = memory.get(key);
  if (!b || b.reset < now) {
    memory.set(key, { count: 1, reset: now + windowMs });
    return { success: true, remaining: max - 1, reset: now + windowMs };
  }
  if (b.count >= max) {
    return { success: false, remaining: 0, reset: b.reset };
  }
  b.count += 1;
  return { success: true, remaining: max - b.count, reset: b.reset };
}

let upstash: Ratelimit | null = null;
let upstashImage: Ratelimit | null = null;

if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  upstash = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(40, '1 m'),
    analytics: true,
    prefix: 'rl:chat',
  });
  upstashImage = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(8, '1 m'),
    analytics: true,
    prefix: 'rl:img',
  });
}

export async function limitChat(identifier: string) {
  if (upstash) return upstash.limit(identifier);
  return memoryLimiter(`chat:${identifier}`, 40, 60_000);
}

export async function limitImageGen(identifier: string) {
  if (upstashImage) return upstashImage.limit(identifier);
  return memoryLimiter(`img:${identifier}`, 8, 60_000);
}

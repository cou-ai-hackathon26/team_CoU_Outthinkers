import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.name}:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const current = buckets.get(key);
    const bucket = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + options.windowMs }
      : current;
    bucket.count += 1;
    buckets.set(key, bucket);

    response.setHeader("X-RateLimit-Limit", options.max);
    response.setHeader("X-RateLimit-Remaining", Math.max(0, options.max - bucket.count));
    response.setHeader("X-RateLimit-Reset", Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > options.max) {
      response.status(429).json({ error: "অনেকবার অনুরোধ করা হয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন।" });
      return;
    }
    next();
  };
}

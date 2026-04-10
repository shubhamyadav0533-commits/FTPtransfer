import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import type { PublicApiResponse } from "./publicTypes";

/**
 * General rate limiter: 100 requests per minute per API key.
 * Falls back to IP if no API key is present.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }
    return req.ip ?? "unknown";
  },
  handler: (_req: Request, res: Response) => {
    const response: PublicApiResponse = {
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again later.",
    };
    res.status(429).json(response);
  },
});

/**
 * Upload rate limiter: 10 uploads per minute per API key.
 */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      return `upload:${authHeader.substring(7)}`;
    }
    return `upload:${req.ip ?? "unknown"}`;
  },
  handler: (_req: Request, res: Response) => {
    const response: PublicApiResponse = {
      success: false,
      code: "RATE_LIMIT_EXCEEDED",
      message: "Upload rate limit exceeded. Maximum 10 uploads per minute.",
    };
    res.status(429).json(response);
  },
});

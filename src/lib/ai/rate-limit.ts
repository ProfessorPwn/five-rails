// ─── Rate Limit Utilities ─────────────────────────────────────────────────────
// Ported from autoforge/rate_limit_utils.py
// Shared utilities for detecting and handling API rate limits.

// Regex patterns for rate limit detection (word boundaries to avoid false positives)
const RATE_LIMIT_PATTERNS = [
  /\brate[_\s]?limit/i,
  /\btoo\s+many\s+requests/i,
  /\bhttp\s*429\b/i,
  /\bstatus\s*429\b/i,
  /\berror\s*429\b/i,
  /\b429\s+too\s+many/i,
  /\b(?:server|api|system)\s+(?:is\s+)?overloaded\b/i,
  /\bquota\s*exceeded\b/i,
];

/**
 * Detect if an error message indicates a rate limit.
 * Uses regex patterns with word boundaries to avoid false positives.
 */
export function isRateLimitError(errorMessage: string): boolean {
  return RATE_LIMIT_PATTERNS.some((p) => p.test(errorMessage));
}

/**
 * Extract retry-after seconds from various error message formats.
 * Handles: "Retry-After: 60", "retry after 60 seconds", "try again in 5 seconds"
 */
export function parseRetryAfter(errorMessage: string): number | null {
  const patterns = [
    /retry.?after[:\s]+(\d+)\s*(?:seconds?|s\b)/i,
    /retry.?after[:\s]+(\d+)(?:\s*$|\s*[,.])/i,
    /try again in\s+(\d+)\s*(?:seconds?|s\b)/i,
    /try again in\s+(\d+)(?:\s*$|\s*[,.])/i,
    /(\d+)\s*seconds?\s*(?:remaining|left|until)/i,
  ];

  for (const pattern of patterns) {
    const match = errorMessage.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Exponential backoff with jitter for rate limits.
 * Base: min(15 * 2^retries, 3600) + 0-30% jitter
 * Sequence: ~15-20s, ~30-40s, ~60-78s, ~120-156s, ...
 */
export function calculateRateLimitBackoff(retries: number): number {
  const base = Math.min(Math.max(15 * Math.pow(2, retries), 1), 3600);
  const jitter = Math.random() * base * 0.3;
  return Math.floor(base + jitter);
}

/**
 * Linear backoff for non-rate-limit errors.
 * Formula: min(30 * retries, 300) — caps at 5 minutes
 */
export function calculateErrorBackoff(retries: number): number {
  return Math.min(Math.max(30 * retries, 1), 300);
}

/**
 * Clamp a retry delay to a safe range (1-3600 seconds).
 */
export function clampRetryDelay(delaySeconds: number): number {
  return Math.min(Math.max(delaySeconds, 1), 3600);
}

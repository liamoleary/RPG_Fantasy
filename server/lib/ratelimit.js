/**
 * Fixed-window rate limiting (Launch Plan §7).
 *
 * In-process on purpose. This is one small Railway service for a private
 * playtest; a Redis dependency to count requests for a dozen friends would cost
 * more than it protects. Two honest consequences, both acceptable here:
 * counters reset on redeploy, and they don't aggregate across replicas — so if
 * this service is ever scaled past one instance, the effective limit multiplies
 * by the replica count.
 *
 * The point is stopping an endpoint being farmed (§1's 5/hour account creation),
 * not surviving a determined attacker.
 */

const HOUR = 60 * 60 * 1000

/**
 * @param {object} opts
 * @param {number} opts.limit    requests allowed per window
 * @param {number} opts.windowMs window length
 * @param {(req) => string} opts.key what to count by — IP, token, account id
 * @param {string} opts.name     appears in the 429 body for debugging
 */
export function createLimiter({ limit, windowMs = HOUR, key, name = 'request' }) {
  /** @type {Map<string, { count: number, resetAt: number }>} */
  const buckets = new Map()

  // Sweep expired buckets so a long-lived process doesn't accumulate keys.
  // unref() so the timer never holds the event loop open in tests.
  const sweeper = setInterval(() => {
    const now = Date.now()
    for (const [k, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(k)
  }, windowMs).unref?.()
  void sweeper

  function check(id) {
    const now = Date.now()
    const bucket = buckets.get(id)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + windowMs })
      return { allowed: true, remaining: limit - 1, resetAt: now + windowMs }
    }
    if (bucket.count >= limit) return { allowed: false, remaining: 0, resetAt: bucket.resetAt }
    bucket.count += 1
    return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt }
  }

  const middleware = (req, res, next) => {
    const id = key(req)
    // No id means nothing to count by (e.g. an unauthenticated call on a
    // token-keyed limiter); let the route's own auth reject it instead.
    if (!id) return next()
    const verdict = check(id)
    res.setHeader('X-RateLimit-Limit', String(limit))
    res.setHeader('X-RateLimit-Remaining', String(verdict.remaining))
    if (!verdict.allowed) {
      const retryAfter = Math.max(1, Math.ceil((verdict.resetAt - Date.now()) / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ error: 'rate_limited', message: `too many ${name} requests`, retryAfter })
    }
    return next()
  }

  middleware.reset = () => buckets.clear()
  middleware.check = check
  return middleware
}

/** Railway sits behind a proxy, so req.ip is only meaningful with trust proxy set. */
export const byIp = (req) => req.ip ?? req.socket?.remoteAddress ?? ''
export const byAccount = (req) => req.account?.id ?? ''

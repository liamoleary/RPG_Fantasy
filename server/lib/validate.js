/**
 * Hand-rolled payload guards (Launch Plan §7: "zod or hand-rolled guards").
 *
 * Hand-rolled, because the shapes here are half a dozen flat objects and a
 * schema library would be the largest dependency in the tree for the privilege.
 * The rules §7 asks for: unknown fields dropped, sizes capped, nothing trusted.
 *
 * Everything returns a *clamped value*, never throws — a tester on a flaky phone
 * should not lose a run report because one field was the wrong shape.
 */

/** Reject anything that isn't a plain JSON object (arrays and null included). */
export function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Trimmed string, hard length cap, non-strings become ''. */
export function str(value, max) {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
}

/** Integer clamped to [min, max]; anything unparseable becomes `fallback`. */
export function int(value, min, max, fallback = null) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(n)))
}

/** Keep only members of `allowed`, deduped, capped — used for feedback chips. */
export function enumArray(value, allowed, max) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const item of value) {
    if (typeof item === 'string' && allowed.includes(item)) seen.add(item)
    if (seen.size >= max) break
  }
  return [...seen]
}

/**
 * Drop every key that isn't named. This is the "unknown fields dropped" rule:
 * clients only ever persist the shape we chose, so a future client version can
 * never quietly widen what we store.
 */
export function pick(value, keys) {
  const out = {}
  if (!isPlainObject(value)) return out
  for (const key of keys) if (value[key] !== undefined) out[key] = value[key]
  return out
}

/**
 * Cap a jsonb blob by its serialised size. Telemetry and feedback context are
 * open-ended by design (§3, §4), so the guard is a byte budget rather than a
 * schema. Returns null when it doesn't fit, and the caller decides.
 */
export function jsonWithin(value, maxBytes) {
  if (value === undefined || value === null) return {}
  let text
  try {
    text = JSON.stringify(value)
  } catch {
    return null
  }
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > maxBytes) return null
  return value
}

/** Uniform 400. Message is for a developer in the console, not for the player. */
export function badRequest(res, message) {
  return res.status(400).json({ error: 'invalid_request', message })
}

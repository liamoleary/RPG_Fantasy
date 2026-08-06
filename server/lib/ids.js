/**
 * Secrets and identifiers (Launch Plan §1).
 *
 * Tokens are opaque random bytes, deliberately not JWTs: there are no claims to
 * carry, and a random string that only exists as a SHA-256 digest server-side
 * cannot leak anything if the database walks. Verification is a table lookup.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/** 128-bit device secret, per §1. Returned once, at creation or link, and never again. */
export function newToken() {
  return randomBytes(16).toString('hex')
}

export function newAccountId() {
  return `acc_${randomBytes(12).toString('hex')}`
}

/** Tokens are hashed at rest (§1). No salt: the input is already 128 bits of
 *  uniform randomness, so a per-row salt buys nothing against a preimage search. */
export function hashToken(token) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Constant-time compare for the admin key (§5), so it can't be probed by timing. */
export function secretEquals(a, b) {
  const ba = Buffer.from(String(a ?? ''), 'utf8')
  const bb = Buffer.from(String(b ?? ''), 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/* Link codes are read aloud and typed on a phone, so the alphabet matters more
   than raw entropy: short, unambiguous, memorable for the fifteen minutes it
   lives. 128 × 128 × 90 ≈ 1.5M combinations, single-use, expiring, and behind a
   per-IP attempt limit — brute force isn't the threat model here. */
const CODE_ADJECTIVES = [
  'BRAVE', 'BRIGHT', 'BOLD', 'CALM', 'CLEAR', 'CRIMSON', 'DARING', 'DEEP', 'DIRE', 'DUSKY',
  'EAGER', 'EARLY', 'EMBER', 'FABLED', 'FAIR', 'FALLEN', 'FIERCE', 'FIRST', 'FLEET', 'FROSTY',
  'GALLANT', 'GILDED', 'GLAD', 'GOLDEN', 'GRAND', 'GRAVE', 'GREEN', 'GRIM', 'HARDY', 'HIDDEN',
  'HIGH', 'HOLLOW', 'HUSHED', 'IDLE', 'IRON', 'JADE', 'KEEN', 'KIND', 'LAST', 'LATE',
  'LEAN', 'LIGHT', 'LONE', 'LONG', 'LOST', 'LOYAL', 'LUCKY', 'MERRY', 'MIGHTY', 'MILD',
  'MISTY', 'MOSSY', 'NIMBLE', 'NOBLE', 'NORTH', 'OAKEN', 'OLD', 'PALE', 'PATIENT', 'PROUD',
  'QUICK', 'QUIET', 'RAPID', 'RARE', 'REGAL', 'RESTLESS', 'ROYAL', 'RUGGED', 'RUSTIC', 'SAGE',
  'SCARLET', 'SEVENTH', 'SHARP', 'SHY', 'SILENT', 'SILVER', 'SLY', 'SOLEMN', 'SOUTH', 'SPRY',
  'STARLIT', 'STEADY', 'STERN', 'STILL', 'STONE', 'STORMY', 'STOUT', 'SUDDEN', 'SUNLIT', 'SURE',
  'SWIFT', 'TALL', 'THORNY', 'TIDAL', 'TRUE', 'TWIN', 'VALIANT', 'VAST', 'VERDANT', 'VIGIL',
  'WANDERING', 'WARM', 'WARY', 'WATCHFUL', 'WEARY', 'WEST', 'WHITE', 'WILD', 'WILY', 'WINTRY',
  'WISE', 'WOVEN', 'YOUNG', 'ZEALOUS', 'AMBER', 'ASHEN', 'AZURE', 'BRISK', 'CLOUDED', 'CORAL',
  'DAWN', 'DUSK', 'ELDER', 'FERAL', 'GLEAMING', 'HALLOWED', 'LUMINOUS', 'RADIANT',
]

const CODE_NOUNS = [
  'STAG', 'WOLF', 'HAWK', 'BEAR', 'BOAR', 'CROW', 'DOVE', 'DRAKE', 'EAGLE', 'ELK',
  'FALCON', 'FOX', 'GRIFFIN', 'HARE', 'HERON', 'HOUND', 'IBEX', 'KITE', 'LARK', 'LION',
  'LYNX', 'MARE', 'MOTH', 'OTTER', 'OWL', 'RAM', 'RAVEN', 'ROOK', 'SERPENT', 'SHRIKE',
  'SPARROW', 'STALLION', 'STORK', 'SWAN', 'TIGER', 'VIPER', 'WREN', 'ACORN', 'ANVIL', 'ARROW',
  'BANNER', 'BASTION', 'BEACON', 'BELL', 'BLADE', 'BOUGH', 'BRIDGE', 'CAIRN', 'CANDLE', 'CHALICE',
  'CLOAK', 'COMPASS', 'CROWN', 'DAGGER', 'EMBER', 'FERN', 'FLAGON', 'FORGE', 'GATE', 'GLADE',
  'GROVE', 'HAMMER', 'HARBOUR', 'HEARTH', 'HELM', 'HOLLY', 'HORN', 'KEEP', 'LANTERN', 'LEDGER',
  'MANTLE', 'MOOR', 'OAK', 'ORCHARD', 'PENNANT', 'PILLAR', 'QUILL', 'QUIVER', 'RAMPART', 'REED',
  'RIVER', 'ROSE', 'SADDLE', 'SHIELD', 'SIGIL', 'SPEAR', 'SPIRE', 'STANDARD', 'STONE', 'TANKARD',
  'THISTLE', 'THORN', 'TORCH', 'TOWER', 'TRAIL', 'VALE', 'VIGIL', 'WARDEN', 'WILLOW', 'YEW',
  'ANCHOR', 'ARBOUR', 'BRAMBLE', 'CINDER', 'CLOVER', 'COVE', 'CREST', 'DRUM', 'FJORD', 'FOUNT',
  'GARLAND', 'HAVEN', 'HOLLOW', 'LOCKET', 'MEADOW', 'MILL', 'PATH', 'RIDGE', 'SUMMIT', 'TIDE',
  'TRINKET', 'VAULT', 'WELL', 'WHARF', 'WREATH', 'ANTLER', 'BASIN', 'CANOPY',
]

/** `BRAVE-STAG-41` — the format §1 specifies. */
export function newLinkCode() {
  const adjective = CODE_ADJECTIVES[randomInt(CODE_ADJECTIVES.length)]
  const noun = CODE_NOUNS[randomInt(CODE_NOUNS.length)]
  return `${adjective}-${noun}-${randomInt(10, 100)}`
}

/**
 * Testers read these off one screen and type them into another, so accept the
 * mess that produces: any case, stray spaces, spaces or underscores instead of
 * hyphens. Returns '' if it can't be coerced into the shape.
 */
export function normaliseLinkCode(raw) {
  if (typeof raw !== 'string') return ''
  const cleaned = raw.trim().toUpperCase().replace(/[\s_]+/g, '-').replace(/-+/g, '-')
  return /^[A-Z]{2,12}-[A-Z]{2,12}-\d{2}$/.test(cleaned) ? cleaned : ''
}

export const CODE_WORD_COUNTS = { adjectives: CODE_ADJECTIVES.length, nouns: CODE_NOUNS.length }

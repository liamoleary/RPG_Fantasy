/**
 * Display names (Launch Plan §1) — the only human-entered data in the system
 * besides feedback text, and the only thing here that could ever be called PII.
 * Max 20 chars, profanity-filtered, pre-filled from a fantasy name-bank so a
 * tester who just wants to play never has to type anything.
 */

const ADJECTIVES = [
  'Bold', 'Bright', 'Wandering', 'Gilded', 'Hollow', 'Iron', 'Verdant', 'Ashen', 'Silent', 'Crimson',
  'Elder', 'Nimble', 'Stalwart', 'Wintry', 'Sunlit', 'Grave', 'Fabled', 'Thorned', 'Restless', 'Moonlit',
]

const TITLES = [
  'Warden', 'Herald', 'Marshal', 'Ranger', 'Sentinel', 'Vanguard', 'Champion', 'Bannerman', 'Skirmisher', 'Outrider',
  'Keeper', 'Reeve', 'Bailiff', 'Steward', 'Lancer', 'Archer', 'Shieldbearer', 'Pathfinder', 'Falconer', 'Standard',
]

/** Suggestion shown in the name field on first boot. Never unique — it's a
 *  starting point a tester overwrites, not an identity. */
export function suggestName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const t = TITLES[Math.floor(Math.random() * TITLES.length)]
  return `${a} ${t}`
}

/* A deliberately small blocklist. This is a private playtest with friends, not a
   public product with a moderation queue (§9 rules that out) — the job is to stop
   a display name from being ugly in the admin summary, not to win an arms race. */
const BLOCKED = [
  'anal', 'anus', 'arse', 'bastard', 'bitch', 'bollock', 'boner', 'clit', 'cock', 'coon',
  'cunt', 'dick', 'dildo', 'douche', 'dyke', 'fag', 'fuck', 'jizz', 'kike', 'nigg',
  'penis', 'piss', 'prick', 'pussy', 'rape', 'retard', 'semen', 'shit', 'slut', 'spunk',
  'tits', 'twat', 'vagina', 'wank', 'whore',
]

/** Fold the usual substitutions so `f_u_c_k` and `sh1t` don't sail through. */
function normaliseForFilter(name) {
  return name
    .toLowerCase()
    .replace(/[013457@$!|]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i', '|': 'i' })[c] ?? c)
    .replace(/[^a-z]/g, '')
}

export function isClean(name) {
  const folded = normaliseForFilter(name)
  return !BLOCKED.some((word) => folded.includes(word))
}

export const NAME_MAX = 20

/**
 * Returns `{ ok, name }` or `{ ok: false, reason }`. Collapses whitespace and
 * strips control characters so a name can't smuggle newlines into the summary
 * page; the rest of the character set stays open, because testers have accents
 * in their names and a playtest shouldn't refuse them.
 */
export function validateDisplayName(raw) {
  if (typeof raw !== 'string') return { ok: false, reason: 'name must be text' }
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim()
  if (cleaned.length === 0) return { ok: false, reason: 'name cannot be empty' }
  if (cleaned.length > NAME_MAX) return { ok: false, reason: `name must be ${NAME_MAX} characters or fewer` }
  if (!isClean(cleaned)) return { ok: false, reason: 'please pick another name' }
  return { ok: true, name: cleaned }
}

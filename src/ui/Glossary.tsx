import { KEYWORD_GLOSSARY } from './keywords'

/**
 * Every mark the game puts on screen, in one place. The Inspect sheet explains
 * a unit's own keywords in context; this is the reference for the symbols that
 * have nowhere else to introduce themselves.
 */
interface SymbolEntry {
  /** rendered as the badge itself so the page looks like the game */
  mark: string
  cls?: string
  name: string
  text: string
}

interface SymbolGroup {
  group: string
  entries: SymbolEntry[]
}

export const SYMBOL_GLOSSARY: SymbolGroup[] = [
  {
    group: 'On every unit card',
    entries: [
      { mark: '12', cls: 'g-count', name: 'Count badge', text: 'How many individuals are in the stack. A stack swings for its ATK times this number, so count is damage.' },
      { mark: '2', cls: 'g-atk', name: 'ATK', text: "One unit's attack. The orange number. Total damage a swing is ATK x count." },
      { mark: '5', cls: 'g-hp', name: 'HP', text: "One unit's health. The green number. The stack's pooled health is HP x count." },
      { mark: '◈4', cls: 'g-bul', name: 'Bulwark chip', text: 'Armour currently on the stack. Shows only when the stack has some. See Bulwark below.' },
      { mark: 'T3', cls: 'g-dim', name: 'Tier pip', text: 'Which Camp Tier unlocks this unit. Raise your Camp Tier to see higher tiers in the offer.' },
      { mark: '+4 · 3g', cls: 'g-gold', name: 'Recruit button', text: 'Every purchase costs 3 gold and adds this many units to the stack. Tap the card itself to read it first — that never spends gold.' },
    ],
  },
  {
    group: 'Row and position',
    entries: [
      { mark: '⚔', name: 'Front line only', text: 'This unit can only stand in the front row, where it absorbs enemy melee.' },
      { mark: '➶', name: 'Back line only', text: 'This unit can only stand in the back row. Melee cannot reach it until your front line is empty — but Volley, Siege and spells can.' },
      { mark: '◈', name: 'Either row', text: 'This unit can stand in either row. Put it where you need it.' },
    ],
  },
  {
    group: 'Progression',
    entries: [
      { mark: '▲', cls: 'g-promote', name: 'Promotion ready', text: 'This stack can be promoted right now and you can afford it. Tap the stack to see what it becomes.' },
      { mark: '▲', cls: 'g-promote-soon', name: 'Promotion waiting', text: 'This stack is eligible to promote but you are short on gold, or your Camp Tier is too low for the next form. Tap it to see which.' },
      { mark: '›', cls: 'g-vet', name: 'Veteran', text: 'Banner Rank 1. The stack grew past its first size threshold and earned a permanent stat bonus.' },
      { mark: '››', cls: 'g-hon', name: 'Honored', text: 'Banner Rank 2. The stack earned its milestone skill — the big one. Ranks are permanent and survive promotion.' },
    ],
  },
  {
    group: 'Cover',
    entries: [
      { mark: '▮▮', cls: 'g-cover', name: 'Cover charges', text: 'Shield dots on a front-row stack. Each one intercepts a single enemy volley aimed at the back-row stack behind it. Charges reset every battle.' },
      { mark: '↷', cls: 'g-cover', name: 'Arcing shot', text: 'A volley in flight. It arcs over the front line, which is how you tell a ranged attack from a melee lunge.' },
      { mark: '✓', cls: 'g-cover', name: '"Covered!"', text: 'A volley was intercepted. The arc bends to the coverer, it takes the hit instead, and the stack behind it glows and takes nothing.' },
    ],
  },
  {
    group: 'The lobby ladder',
    entries: [
      { mark: '30', cls: 'g-count', name: 'Banner chip', text: "A rival warlord's remaining HP, under their hero's face. Tap any chip to inspect that warlord." },
      { mark: '30', cls: 'g-you', name: 'Gold ring', text: 'That one is you.' },
      { mark: '30', cls: 'g-foe', name: 'Red ring', text: 'The warlord you fight this round. Tap Scout to see their board before you commit.' },
      { mark: '✕', cls: 'g-dead', name: 'Greyed out', text: 'Eliminated. Their board can still return as a ghost if the lobby has an odd number left.' },
    ],
  },
  {
    group: 'During a battle',
    entries: [
      { mark: '-14', cls: 'g-dmg', name: 'Red number', text: 'Damage dealt to that stack.' },
      { mark: '◈6', cls: 'g-bul', name: 'Blue number', text: 'Damage soaked by Bulwark instead of hitting the stack.' },
      { mark: '+8', cls: 'g-heal', name: 'Green number', text: 'Healing, which can revive fallen units up to the stack’s starting count.' },
      { mark: '+2', cls: 'g-buff', name: 'Yellow number', text: 'A buff — Frenzy, a hero spell or an ally ability raising the stack’s stats.' },
    ],
  },
]

export function GlossarySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Symbols &amp; keywords</h2>
        <div className="small dim">
          Everything the game puts on a card. Tapping any unit, anywhere, also explains that unit's own keywords with its
          numbers filled in.
        </div>

        {SYMBOL_GLOSSARY.map((section) => (
          <div key={section.group} style={{ display: 'grid', gap: 6 }}>
            <div className="eyebrow">{section.group}</div>
            {section.entries.map((e) => (
              <div key={e.name} className="glossary-row">
                <span className={`glossary-mark ${e.cls ?? ''}`}>{e.mark}</span>
                <span className="grow">
                  <strong className="small">{e.name}</strong>
                  <span className="tiny dim" style={{ display: 'block' }}>
                    {e.text}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ))}

        <div className="eyebrow">Ability keywords</div>
        {KEYWORD_GLOSSARY.map((k) => (
          <div key={k.id} className="glossary-row">
            <span className="glossary-mark g-kw">{k.name.slice(0, 2)}</span>
            <span className="grow">
              <strong className="small">{k.name}</strong>
              <span className="tiny dim" style={{ display: 'block' }}>
                {k.text}
              </span>
            </span>
          </div>
        ))}

        <button className="btn btn-primary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

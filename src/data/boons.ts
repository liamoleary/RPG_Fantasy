import type { BoonDef } from './types'

/**
 * Boon pools. Rule of thumb from the GDD: at least half of each branch must
 * change *decisions* (what you buy, where you stand), not just numbers.
 * Decision-changing boons are marked with a `→` in their text.
 */
export const BOONS: BoonDef[] = [
  // ── MIGHT ────────────────────────────────────────────────────────────────
  { id: 'b_sharpened', name: 'Sharpened Steel', branch: 'might', minRound: 2, text: '+1 ATK to every unit in your army.', mods: { allAtk: 1 } },
  { id: 'b_rations', name: 'Iron Rations', branch: 'might', minRound: 2, text: '+2 HP to every unit in your army.', mods: { allHp: 2 } },
  { id: 'b_frontline', name: 'Front Line Doctrine', branch: 'might', minRound: 2, text: '+2 ATK to front-row units. → rewards a wide front.', mods: { frontAtk: 2 } },
  { id: 'b_marksmen', name: 'Marksmen', branch: 'might', minRound: 2, text: '+2 ATK to back-row units. → rewards a ranged core.', mods: { backAtk: 2 } },
  { id: 'b_levy', name: 'Mass Levy', branch: 'might', minRound: 2, text: 'Tier 1–2 recruits arrive with +2 extra count. → makes cheap stacks scale.', mods: { t12CountBonus: 2 } },
  { id: 'b_elite_muster', name: 'Elite Muster', branch: 'might', minRound: 4, text: 'Tier 4–5 recruits arrive with +1 extra count. → makes elites worth stacking.', mods: { t45CountBonus: 1 } },
  { id: 'b_shieldwall', name: 'Shield Wall', branch: 'might', minRound: 2, text: '+2 Bulwark to front-row stacks at battle start.', mods: { frontBulwark: 2 } },
  { id: 'b_bloodlust', name: 'Bloodlust', branch: 'might', minRound: 4, text: 'Frenzy triggers grant +2 extra ATK. → pushes you toward casualty-hungry stacks.', mods: { frenzyAtk: 2 } },
  { id: 'b_fertile', name: 'Fertile Ground', branch: 'might', minRound: 4, text: 'Growth grants +1 extra ATK and HP. → rewards buying Growth early and holding it.', mods: { growthBonus: 1 } },
  { id: 'b_volleydrill', name: 'Volley Drill', branch: 'might', minRound: 4, text: '+2 ATK to Volley stacks. → makes ranged units the plan.', mods: { volleyAtk: 2 } },
  { id: 'b_vengeance', name: 'Vengeance', branch: 'might', minRound: 4, text: 'Your stacks retaliate with +2 ATK. → rewards tanky front stacks that survive.', mods: { retaliationAtk: 2 } },
  { id: 'b_warcry', name: 'Warcry of the Van', branch: 'might', minRound: 10, capstone: true, text: 'Every stack you own gains Charge. → your whole army acts first on cycle 1.', mods: { chargeAll: true } },
  { id: 'b_vampiric', name: 'Vampiric Banner', branch: 'might', minRound: 10, capstone: true, text: 'Every stack you own gains Lifesteal.', mods: { lifestealAll: true } },
  { id: 'b_cleaver', name: 'Cleaving Advance', branch: 'might', minRound: 10, capstone: true, text: 'Your front-row stacks gain Cleave. → adjacency suddenly matters everywhere.', mods: { cleaveFront: true } },

  // ── MAGIC ────────────────────────────────────────────────────────────────
  { id: 'b_focus', name: 'Focus', branch: 'magic', minRound: 2, text: 'Your battle spell is +3 stronger.', mods: { spellPower: 3 } },
  { id: 'b_deepfocus', name: 'Deep Focus', branch: 'magic', minRound: 6, text: 'Your battle spell is +7 stronger.', mods: { spellPower: 7 } },
  { id: 'b_echo', name: 'Echoing Word', branch: 'magic', minRound: 2, text: 'Your battle spell casts one extra time per battle. → longer fights pay off.', mods: { spellExtraCasts: 1 } },
  { id: 'b_quicken', name: 'Quickened Cant', branch: 'magic', minRound: 2, text: 'Your battle spell recurs 1 exchange sooner.', mods: { spellCadenceReduction: 1 } },
  { id: 'b_torrent', name: 'Torrent of Words', branch: 'magic', minRound: 8, text: 'Your battle spell recurs 2 exchanges sooner. → spell-centric builds take over.', mods: { spellCadenceReduction: 2 } },
  { id: 'b_attunement', name: 'Attunement', branch: 'magic', minRound: 4, text: 'Your battle spell gains +2 power per hero level. → snowballs late.', mods: { spellPowerPerLevel: 2 } },
  { id: 'b_splash', name: 'Spellsplash', branch: 'magic', minRound: 4, text: 'Your battle spell affects one additional target. → changes which spell targets matter.', mods: { spellSplash: 1 } },
  { id: 'b_leyline', name: 'Leyline Tap', branch: 'magic', minRound: 6, text: '+1 extra cast and +2 spell power.', mods: { spellExtraCasts: 1, spellPower: 2 } },
  { id: 'b_ward', name: 'Warded Vanguard', branch: 'magic', minRound: 4, text: 'Your first-striking stack begins with +3 Bulwark and your spell is +1 stronger.', mods: { firstStrikeBulwark: 3, spellPower: 1 } },
  { id: 'b_archmage', name: 'Archmage', branch: 'magic', minRound: 10, capstone: true, text: '+2 extra casts and +6 spell power. → the spell becomes your win condition.', mods: { spellExtraCasts: 2, spellPower: 6 } },
  { id: 'b_cataclysm', name: 'Cataclysm', branch: 'magic', minRound: 10, capstone: true, text: '+12 spell power, +1 target.', mods: { spellPower: 12, spellSplash: 1 } },

  // ── COMMAND ──────────────────────────────────────────────────────────────
  { id: 'b_tribute', name: 'Tribute', branch: 'command', minRound: 2, text: '+1 gold every Muster.', mods: { income: 1 } },
  { id: 'b_tithe', name: 'War Tithe', branch: 'command', minRound: 6, text: '+2 gold every Muster.', mods: { income: 2 } },
  { id: 'b_haggler', name: 'Haggler', branch: 'command', minRound: 2, text: 'Rerolls are free. → reroll aggressively for the piece you need.', mods: { rerollDiscount: 1 } },
  { id: 'b_scoutcamp', name: 'Wider Camp', branch: 'command', minRound: 2, text: '+1 War Camp offer slot. → more choice every single round.', mods: { extraOfferSlots: 1 } },
  { id: 'b_quartermaster', name: 'Quartermaster', branch: 'command', minRound: 2, text: 'Camp Tier upgrades cost 2 less. → rush the high tiers.', mods: { tierUpDiscount: 2 } },
  { id: 'b_drillyard', name: 'Drillyard', branch: 'command', minRound: 2, text: 'Promotions cost 2 less. → promote wide instead of buying tall.', mods: { promoteDiscount: 2 } },
  { id: 'b_salvage', name: 'Salvage Rights', branch: 'command', minRound: 4, text: 'Selling refunds +1 gold. → pivot builds cheaply.', mods: { sellBonus: 1 } },
  { id: 'b_forwardcamp', name: 'Forward Camp', branch: 'command', minRound: 4, text: 'Raise your Camp Tier by 1 immediately.', mods: { campTierUp: 1 } },
  { id: 'b_logistics', name: 'Logistics Corps', branch: 'command', minRound: 6, text: '+1 gold every Muster and Camp Tier upgrades cost 1 less.', mods: { income: 1, tierUpDiscount: 1 } },
  { id: 'b_spymaster', name: 'Spymaster', branch: 'command', minRound: 4, text: '2 free rerolls every Muster. → dig for exactly the unit you want.', mods: { freeRerollsPerRound: 2 } },
  { id: 'b_warchest', name: 'War Chest', branch: 'command', minRound: 10, capstone: true, text: '+3 gold every Muster and +1 offer slot.', mods: { income: 3, extraOfferSlots: 1 } },
  { id: 'b_grandmarshal', name: 'Grand Marshal', branch: 'command', minRound: 10, capstone: true, text: 'Rerolls free, promotions cost 2 less, +1 gold. → rebuild your board every round.', mods: { rerollDiscount: 1, promoteDiscount: 2, income: 1 } },

  // ── HERO SIGNATURES ──────────────────────────────────────────────────────
  { id: 'b_oathwall', heroId: 'h_berrik', name: 'Oathwall', branch: 'might', minRound: 2, text: '+3 Bulwark and +1 ATK to front-row stacks.', mods: { frontBulwark: 3, frontAtk: 1 } },
  { id: 'b_bulwark_engine', heroId: 'h_berrik', name: 'Endless Oath', branch: 'magic', minRound: 4, text: 'Shield Line is +4 stronger and casts one extra time.', mods: { spellPower: 4, spellExtraCasts: 1 } },
  { id: 'b_unbroken_line', heroId: 'h_yseult', name: 'The Unbroken Line', branch: 'might', minRound: 4, text: '+3 HP to every unit in your army.', mods: { allHp: 3 } },
  { id: 'b_horn_echo', heroId: 'h_yseult', name: 'Echoing Horn', branch: 'magic', minRound: 4, text: 'Rallying Horn recurs 3 exchanges sooner.', mods: { spellCadenceReduction: 3 } },
  { id: 'b_first_bloom', heroId: 'h_sylvaen', name: 'First Bloom', branch: 'might', minRound: 2, text: 'Growth grants +2 extra ATK and HP.', mods: { growthBonus: 2 } },
  { id: 'b_worldroot', heroId: 'h_sylvaen', name: 'Worldroot', branch: 'magic', minRound: 8, text: 'Rejuvenate is +10 stronger.', mods: { spellPower: 10 } },
  { id: 'b_thorn_crown', heroId: 'h_maravel', name: 'Thorn Crown', branch: 'might', minRound: 6, text: '+2 ATK to every unit in your army.', mods: { allAtk: 2 } },
  { id: 'b_bramble_field', heroId: 'h_maravel', name: 'Bramble Field', branch: 'magic', minRound: 6, text: 'Bramble Coil casts 2 extra times per battle.', mods: { spellExtraCasts: 2 } },
  { id: 'b_blood_tide', heroId: 'h_grommash', name: 'Blood Tide', branch: 'might', minRound: 4, text: 'Frenzy triggers grant +3 extra ATK.', mods: { frenzyAtk: 3 } },
  { id: 'b_storm_crown', heroId: 'h_grommash', name: 'Storm Crown', branch: 'magic', minRound: 6, text: 'Chain Lightning is +9 stronger and arcs to one more stack.', mods: { spellPower: 9, spellSplash: 1 } },
  { id: 'b_nine_winds', heroId: 'h_zhala', name: 'The Nine Winds', branch: 'magic', minRound: 4, text: 'Ancestral Fury casts 2 extra times and recurs 1 exchange sooner.', mods: { spellExtraCasts: 2, spellCadenceReduction: 1 } },
  { id: 'b_ancestor_echo', heroId: 'h_zhala', name: 'Ancestors March', branch: 'might', minRound: 8, text: '+1 ATK to all units and every stack gains Charge.', mods: { allAtk: 1, chargeAll: true } },
]

export const BOON_BY_ID = new Map(BOONS.map((b) => [b.id, b]))

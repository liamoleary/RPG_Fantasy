import type { SigilId } from '../data/types'

/**
 * Every unit, hero and faction icon in the game comes from here: inline SVG
 * paths on a shared 24x24 grid, no image assets anywhere (§11.2).
 */
const PATHS: Record<SigilId, string> = {
  shield: 'M12 2 4 5v7c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5Z',
  hammer: 'M7 3h8v4h-2v3h3l1 11h-6l1-11h3V7H9v3H7Z M4 4h4v4H4Z',
  bow: 'M6 2c7 3 7 17 0 20 M6 2l12 10L6 22 M18 12h3',
  cart: 'M3 8h11l3 5h4v4H3Z M7 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M18 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  cross: 'M10 2h4v6h6v4h-6v10h-4V12H4V8h6Z',
  cannon: 'M3 12h5l10-5 3 4-10 5H3Z M4 16h7v4H4Z',
  colossus: 'M12 2 5 6v6c0 6 3 9 7 10 4-1 7-4 7-10V6Z M9 10h6v3H9Z',
  leaf: 'M20 3C10 3 4 8 4 15c0 3 2 6 5 6 7 0 11-7 11-18Z M9 20c2-6 5-9 9-11',
  tree: 'M12 2 6 9h3l-4 6h5v7h4v-7h5l-4-6h3Z',
  moon: 'M18 15A9 9 0 0 1 8 4a9 9 0 1 0 10 11Z',
  thorn: 'M12 2 8 10l4-2 4 2Z M12 10 6 22l6-4 6 4Z',
  stag: 'M12 8a4 4 0 0 1 4 4v8H8v-8a4 4 0 0 1 4-4Z M8 8 5 2m3 6L4 6m12 2 3-6m-3 6 4-2',
  fang: 'M4 3h16l-3 9-5 10-5-10Z M9 6l3 8 3-8',
  lightning: 'M13 2 4 14h6l-2 8 10-13h-6Z',
  wolf: 'M4 6l3-4 2 4h6l2-4 3 4v6c0 5-4 9-8 9s-8-4-8-9Z M9 11h.01M15 11h.01',
  drum: 'M5 8h14v8H5Z M5 8 8 4h8l3 4 M5 16l3 4h8l3-4',
  totem: 'M12 2v20 M6 6h12 M7 12h10 M8 18h8',
  dagger: 'M12 2 15 9v7h-6V9Z M9 16h6v2h-6Z M11 18h2v4h-2Z',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z M9 9h6M9 15h6M12 7v10',
  wall: 'M3 6h18v5H3Z M3 13h18v5H3Z M9 6v5M15 6v5M6 13v5M12 13v5M18 13v5',
  dragon: 'M3 10c4-6 10-7 14-4l4-3-2 6c2 5-2 12-9 12-5 0-8-4-8-8Z M15 9h.01',
  skull: 'M12 2a8 8 0 0 0-8 8v4l2 2v4h12v-4l2-2v-4a8 8 0 0 0-8-8Z M9 11h.01M15 11h.01',
}

export function Sigil({ id, size = 22, className }: { id: SigilId; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[id]} />
    </svg>
  )
}

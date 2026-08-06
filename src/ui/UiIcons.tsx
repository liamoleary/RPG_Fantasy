/**
 * Interface icons — feedback, account, settings.
 *
 * Inline SVG on the same 24x24 grid as Sigil, for the same reason: text glyphs
 * (✒ ☰ ⚙) are drawn by whatever font the device happens to have, so they arrive
 * at different widths, weights and baselines and refuse to line up in a row.
 * These are three identical squares by construction.
 */

const PATHS = {
  /* A quill over a line — "write us something", which is what the sheet asks. */
  feedback: 'M20 4c-6 1-10 4-12 9l-2 5 5-2c5-2 8-6 9-12Z M6 18l5-5',
  /* A banner on a pole: the game's own word for an account is "your banner". */
  account: 'M6 3v18 M6 4h12l-3 4 3 4H6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.2 2.2 M16.9 16.9l2.2 2.2 M19.1 4.9l-2.2 2.2 M7.1 16.9l-2.2 2.2',
} as const

export type UiIconId = keyof typeof PATHS

export function UiIcon({ id, size = 18 }: { id: UiIconId; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[id]} />
    </svg>
  )
}

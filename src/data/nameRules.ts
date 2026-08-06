/**
 * Display-name rules shared by the UI (Launch Plan §1).
 *
 * The authority is server/lib/names.js — the client only needs the length cap so
 * the input can stop typing at the same point the server would truncate. Kept
 * here rather than imported because server/ is unbuilt JavaScript and src/ is
 * TypeScript; the two must be changed together.
 */
export const NAME_MAX = 20

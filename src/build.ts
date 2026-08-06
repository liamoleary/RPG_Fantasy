/**
 * Build identity (Launch Plan §6).
 *
 * Every feedback row and run report carries this, so "is this complaint from
 * before the fix?" is always answerable (§6). Vite inlines the value at build
 * time; a dev server that never set it reports 'dev', which is honest and
 * distinguishable from a real deploy in the admin export.
 *
 * Commit 6 wires the git SHA into the build and adds the update toast. Until
 * then this is already stamped on everything, so no data goes untagged.
 */
export const BUILD_ID: string = (import.meta.env?.VITE_BUILD_ID as string | undefined) ?? 'dev'

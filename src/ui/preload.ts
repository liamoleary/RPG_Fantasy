import { useEffect } from 'react'
import { HERO_ART, HERO_ART_2X, UNIT_ART } from '../data/art'

/**
 * Plate loading strategy (GRAPHICS_UPDATE §4).
 *
 * The battle must never open on a blank frame while an image decodes, so the
 * boards that are about to fight are preloaded during Muster — the player is
 * reading the camp for 30-odd seconds, which is free bandwidth.
 */
export function usePreloadArt(urls: (string | undefined)[]) {
  // Join into a primitive so the effect only re-runs when the set really changes.
  const key = urls.filter((u): u is string => Boolean(u)).join('|')
  useEffect(() => {
    if (!key) return
    const links = key.split('|').map((href) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.as = 'image'
      link.href = href
      document.head.appendChild(link)
      return link
    })
    return () => links.forEach((l) => l.remove())
  }, [key])
}

export function unitArtFor(unitIds: string[]): string[] {
  return unitIds.map((id) => UNIT_ART[id]).filter(Boolean)
}

/**
 * Hand the whole plate list to the service worker once the app is idle, so a
 * second run is instant and the PWA works offline. Deliberately not part of
 * the worker's install step: 3.2 MB is an acceptable cache footprint but not
 * an acceptable thing to block first paint on.
 */
export function warmArtCache() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  const urls = [...Object.values(UNIT_ART), ...Object.values(HERO_ART), ...Object.values(HERO_ART_2X)]
  const send = () => {
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: 'warm-art', urls }))
      .catch(() => {
        // Offline art is a bonus, never a requirement.
      })
  }
  const idle = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
  if (idle) idle(send)
  else window.setTimeout(send, 3000)
}

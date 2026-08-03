import { useState, type ReactNode } from 'react'
import { ART_OBJECT_POSITION } from '../data/art'

/**
 * One painted plate, and the only place the crop rules live.
 *
 * Every plate is a waist-up crop with the face high in frame, so the window is
 * always `cover` at ART_OBJECT_POSITION — centring it decapitates about a third
 * of the roster. If the art is missing or fails to decode we render `fallback`
 * (a Sigil) in the same box, so there is never a broken-image icon or a
 * layout shift.
 */
export function Plate({
  src,
  fallback,
  className,
  eager,
  priority,
  alt = '',
}: {
  src: string | undefined
  fallback: ReactNode
  className?: string
  /** above the fold this frame — skip lazy loading */
  eager?: boolean
  /** hint the fetch ahead of other images (visible camp offers) */
  priority?: boolean
  alt?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className={`plate plate-fallback${className ? ` ${className}` : ''}`} aria-hidden="true">
        {fallback}
      </span>
    )
  }

  return (
    <img
      className={`plate${className ? ` ${className}` : ''}`}
      src={src}
      alt={alt}
      decoding="async"
      loading={eager ? 'eager' : 'lazy'}
      // Lowercase so React 18 passes it through untouched rather than warning.
      {...(priority ? { fetchpriority: 'high' } : {})}
      style={{ objectPosition: ART_OBJECT_POSITION }}
      onError={() => setFailed(true)}
    />
  )
}

/**
 * Express app factory, separated from the listener so tests can drive the real
 * routes over a real socket without booting the production process.
 *
 * Ordering matters here and is deliberate:
 *   helmet → json(64kb) → /api routes → static assets → SPA fallback.
 * The SPA fallback answers everything, so any route added below it is dead; the
 * API must be mounted above it.
 */
import express from 'express'
import helmet from 'helmet'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dbHealth } from './db.js'
import { accountRoutes } from './routes/account.js'
import { feedbackRoutes } from './routes/feedback.js'
import { saveRoutes } from './routes/save.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')

/** §7: Express JSON body limit 64KB. */
export const JSON_LIMIT = '64kb'

export function createApp({ dist = DIST } = {}) {
  const app = express()
  app.disable('x-powered-by')

  // Railway terminates TLS at its edge, so req.ip is the proxy's address unless
  // we trust one hop. Per-IP rate limits (§1) are meaningless without this.
  app.set('trust proxy', 1)

  /* §7: helmet headers. CSP is off because index.html is Vite's own output and
     the service worker and inline module preloads would need a nonce pipeline to
     survive it — a real hardening job, not a playtest one. The headers that cost
     nothing (nosniff, frameguard, referrer policy, HSTS) all stay on.
     No CORS middleware anywhere: §7 wants the API same-origin only, and the SPA
     is served from this same host. */
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }))

  app.use(express.json({ limit: JSON_LIMIT }))

  // A body that fails to parse (malformed JSON, over the limit) should read as a
  // client error, not a stack trace.
  app.use((err, _req, res, next) => {
    if (err && (err.type === 'entity.too.large' || err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
      const tooLarge = err.type === 'entity.too.large'
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge ? 'payload_too_large' : 'invalid_json',
        message: tooLarge ? `body must be under ${JSON_LIMIT}` : 'body was not valid JSON',
      })
    }
    return next(err)
  })

  /**
   * Health check (§8 step 3). Deliberately still 200 when the database is down:
   * Railway restarts a service that fails its healthcheck, and the game is fully
   * playable without persistence (§2).
   */
  app.get('/healthz', async (_req, res) => {
    res.status(200).json({ ok: true, service: 'bannerfell', db: await dbHealth() })
  })

  app.use('/api', accountRoutes())
  app.use('/api', saveRoutes())
  app.use('/api', feedbackRoutes())

  // Unmatched /api paths must 404 as JSON rather than falling through to the
  // SPA — a client fetching a typo'd endpoint should not get index.html back.
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }))

  // Hashed build assets are immutable; the shell and the worker must not be.
  app.use(
    express.static(dist, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        } else if (filePath.endsWith('sw.js') || filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache')
        }
      },
    }),
  )

  // SPA fallback.
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'))
  })

  return app
}

/**
 * Minimal static server for the built SPA.
 *
 * The game is entirely client-side; this exists so Railway has a process to
 * run and so a future /api/save sync has somewhere to live.
 */
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')
const PORT = Number(process.env.PORT) || 8080

const app = express()
app.disable('x-powered-by')

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true, service: 'bannerfell' })
})

// Hashed build assets are immutable; the shell and the worker must not be.
app.use(
  express.static(DIST, {
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
  res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bannerfell listening on :${PORT}`)
})

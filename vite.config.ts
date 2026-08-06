import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* §6: stamp the build so every feedback row and run report can be placed either
   side of a fix. Railway sets RAILWAY_GIT_COMMIT_SHA; a local build falls back
   to git, and a tree with no git at all still produces something honest. */
function buildId() {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VITE_BUILD_ID
  if (fromEnv) return `${fromEnv.slice(0, 7)}-${new Date().toISOString().slice(0, 10)}`
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return `${sha}-${new Date().toISOString().slice(0, 10)}`
  } catch {
    return `local-${new Date().toISOString().slice(0, 10)}`
  }
}

const BUILD_ID = buildId()

export default defineConfig({
  define: { 'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    {
      /* The server answers /api/version from this file rather than recomputing
         the id, so the two can never disagree — which is the whole point of the
         §6 update check. */
      name: 'bannerfell-build-id',
      writeBundle() {
        writeFileSync(resolve('dist', 'build-id.txt'), BUILD_ID)
      },
    },
  ],
  build: {
    outDir: 'dist',
    target: 'es2020',
  },
  server: {
    host: true,
    port: 5173,
  },
})

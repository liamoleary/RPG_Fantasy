import { execSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* §6: stamp the build so every feedback row and run report can be placed either
   side of a fix. Railway sets RAILWAY_GIT_COMMIT_SHA; a local build falls back
   to git, and a tree with no git at all still produces something honest. */
function buildId() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.VITE_BUILD_ID
  if (fromEnv) return `${fromEnv.slice(0, 7)}-${stamp.slice(0, 10)}`
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    return `${sha}-${stamp.slice(0, 10)}`
  } catch {
    /* No SHA available — the Docker build stage has neither .git nor a git
       binary. Fall back to a timestamp down to the minute, not the day: two
       deploys on one afternoon must not share an id, or the §6 update check
       silently decides everyone is current and testers stay on the old build. */
    return `build-${stamp}`
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
    {
      /* public/art/_unassigned holds plates drawn for units that do not exist
         in the game yet. Nothing references them, but publicDir copies
         everything — so without this they are 1.5 MB of dead weight shipped to
         every phone. They stay in the repo, they just do not ship. */
      name: 'bannerfell-drop-unassigned-art',
      writeBundle() {
        rmSync(resolve('dist', 'art', '_unassigned'), { recursive: true, force: true })
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

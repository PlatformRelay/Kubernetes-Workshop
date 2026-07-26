/**
 * Stamp workshop provenance into Vite client env (US-BETA-8).
 *
 * Slidev merges this config. Explicit VITE_WORKSHOP_* (set by release.yml)
 * win; otherwise we fall back via resolveProvenance (tag→version, git→sha,
 * else clear `dev` / `unversioned` markers — never a stale fake version).
 */
import { execSync } from 'node:child_process'
import { resolveProvenance } from './scripts/workshop-provenance.mjs'

function readGitSha() {
  try {
    return execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  }
  catch {
    return ''
  }
}

const { version, sha } = resolveProvenance({
  VITE_WORKSHOP_VERSION: process.env.VITE_WORKSHOP_VERSION,
  VITE_WORKSHOP_SHA: process.env.VITE_WORKSHOP_SHA,
  GITHUB_REF_NAME: process.env.GITHUB_REF_NAME,
  GITHUB_SHA: process.env.GITHUB_SHA,
  gitSha: readGitSha(),
})

// Expose to import.meta.env.* for global-bottom.vue (and any other chrome).
process.env.VITE_WORKSHOP_VERSION = version
process.env.VITE_WORKSHOP_SHA = sha

/** @type {import('vite').UserConfig} */
export default {
  define: {
    'import.meta.env.VITE_WORKSHOP_VERSION': JSON.stringify(version),
    'import.meta.env.VITE_WORKSHOP_SHA': JSON.stringify(sha),
  },
}

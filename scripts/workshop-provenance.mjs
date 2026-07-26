/**
 * Resolve workshop version + short SHA for Slidev chrome (US-BETA-8).
 *
 * Priority:
 *   version: VITE_WORKSHOP_VERSION → GITHUB_REF_NAME (only if `v*` tag) → `dev`
 *   sha:     VITE_WORKSHOP_SHA → GITHUB_SHA → gitSha → `unversioned`
 *
 * Callers (vite.config.mjs) may pass `gitSha` from `git rev-parse HEAD` when
 * available so local builds stamp a real short SHA without inventing a version.
 *
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ version: string, sha: string, label: string }}
 */

/** @param {unknown} value */
export function shortSha(value) {
  if (typeof value !== 'string')
    return ''
  const trimmed = value.trim()
  if (!trimmed)
    return ''
  return trimmed.slice(0, 7)
}

/** @param {unknown} name */
export function isVersionTag(name) {
  return typeof name === 'string' && /^v\d/.test(name)
}

/** @param {Record<string, string | undefined>} [env] */
export function resolveProvenance(env = {}) {
  const version =
    nonempty(env.VITE_WORKSHOP_VERSION)
    || (isVersionTag(env.GITHUB_REF_NAME) ? env.GITHUB_REF_NAME : '')
    || 'dev'

  const sha =
    shortSha(env.VITE_WORKSHOP_SHA)
    || shortSha(env.GITHUB_SHA)
    || shortSha(env.gitSha)
    || 'unversioned'

  return {
    version,
    sha,
    label: `${version} · ${sha}`,
  }
}

/** @param {unknown} value */
function nonempty(value) {
  if (typeof value !== 'string')
    return ''
  const trimmed = value.trim()
  return trimmed || ''
}

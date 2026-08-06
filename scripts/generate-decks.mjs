#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_GITOPS,
  applyGitopsVariant,
  assertExactlyOneGitopsVariant,
  findGeneratedDrift,
  normalizeGitops,
  renderGeneratedDecks,
  sections,
  validateDocumentationTruth,
  validateManifest,
} from './deck-manifest.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const check = process.argv.includes('--check')

function parseGitops(argv) {
  const indexes = argv.flatMap((arg, index) => (arg === '--gitops' ? [index] : []))
  if (indexes.length === 0)
    return DEFAULT_GITOPS
  if (indexes.length > 1)
    throw new Error('Pass --gitops at most once; choose exactly one of: argocd, flux')
  const value = argv[indexes[0] + 1]
  if (value === undefined || value.startsWith('--'))
    throw new Error('Missing --gitops value; use exactly one of: argocd, flux')
  return normalizeGitops(value)
}

let gitops
try {
  gitops = parseGitops(process.argv.slice(2))
} catch (error) {
  console.error(`decks: ${error.message}`)
  process.exit(1)
}
const resolved = applyGitopsVariant(sections, gitops)

try {
  validateManifest(resolved, { repoRoot })
} catch (error) {
  if (gitops === 'flux' && /S21-gitops-flux/.test(error.message)) {
    console.error(
      `decks: flux variant selected but ${error.message}. `
        + 'Flux section content is not authored yet; use --gitops argocd (default) until it lands.',
    )
    process.exit(1)
  }
  throw error
}
validateDocumentationTruth(resolved, { repoRoot })
const expected = renderGeneratedDecks(sections, { gitops })
const drift = findGeneratedDrift(expected, { repoRoot })

for (const [file, content] of expected)
  assertExactlyOneGitopsVariant(content)

if (check) {
  for (const file of expected.keys()) {
    const onDisk = readFileSync(resolve(repoRoot, file), 'utf8')
    assertExactlyOneGitopsVariant(onDisk)
  }
  if (drift.length) {
    console.error(`Generated deck drift: ${drift.join(', ')}. Run \`pnpm decks:generate\`.`)
    process.exit(1)
  }
  console.log(
    `Generated decks are current (${expected.size} entries, ${resolved.length} sections, gitops=${gitops}).`,
  )
} else {
  for (const [file, content] of expected)
    writeFileSync(resolve(repoRoot, file), content)
  console.log(
    `Generated ${expected.size} deck entries from ${resolved.length} sections (gitops=${gitops}).`,
  )
}

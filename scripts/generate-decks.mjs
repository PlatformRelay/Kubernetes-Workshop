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
  const index = argv.indexOf('--gitops')
  if (index < 0)
    return DEFAULT_GITOPS
  return normalizeGitops(argv[index + 1])
}

const gitops = parseGitops(process.argv.slice(2))
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

#!/usr/bin/env node
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  findGeneratedDrift,
  renderGeneratedDecks,
  sections,
  validateManifest,
} from './deck-manifest.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const check = process.argv.includes('--check')

validateManifest(sections, { repoRoot })
const expected = renderGeneratedDecks(sections)
const drift = findGeneratedDrift(expected, { repoRoot })

if (check) {
  if (drift.length) {
    console.error(`Generated deck drift: ${drift.join(', ')}. Run \`pnpm decks:generate\`.`)
    process.exit(1)
  }
  console.log(`Generated decks are current (${expected.size} entries, ${sections.length} sections).`)
} else {
  for (const [file, content] of expected)
    writeFileSync(resolve(repoRoot, file), content)
  console.log(`Generated ${expected.size} deck entries from ${sections.length} sections.`)
}

// Build the static self-check quiz player tree published at /quiz/.
//
// The bank in `quiz/questions.json` stays the source of truth: this script only
// copies the zero-dependency player next to a verbatim copy of the bank plus a
// small section index derived from the deck manifest, so the browser never has
// to import Node-only modules. `scripts/pages-build.sh` runs exactly this, which
// is what makes the Pages layout testable without rebuilding the whole site.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sections as deckSections } from '../deck-manifest.mjs'

export const PLAYER_ASSETS = ['index.html', 'player.css', 'app.mjs', 'logic.mjs']

const repoRoot = path.resolve(import.meta.dirname, '../..')

/**
 * Emit the complete player tree into `outDir`.
 *
 * The section index ships EVERY section with its manifest status, not just the
 * authored ones: the player filters, and a deep link to a section without
 * questions (`#S24`) can then explain itself instead of rendering nothing.
 */
export function buildPlayer({ outDir, root = repoRoot } = {}) {
  if (!outDir) throw new Error('buildPlayer needs an outDir')
  const outputDirectory = path.resolve(outDir)
  mkdirSync(outputDirectory, { recursive: true })

  for (const asset of PLAYER_ASSETS)
    copyFileSync(path.join(root, 'quiz/player', asset), path.join(outputDirectory, asset))

  const bank = JSON.parse(readFileSync(path.join(root, 'quiz/questions.json'), 'utf8'))
  writeFileSync(path.join(outputDirectory, 'questions.json'), `${JSON.stringify(bank, null, 2)}\n`)

  const sections = deckSections.map(({ id, title, day, status }) => ({ id, title, day, status }))
  writeFileSync(
    path.join(outputDirectory, 'sections.json'),
    `${JSON.stringify({ sections }, null, 2)}\n`,
  )

  return {
    outputDirectory,
    assets: [...PLAYER_ASSETS, 'questions.json', 'sections.json'],
    questionCount: bank.questions.length,
    sectionCount: sections.length,
  }
}

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const outFlag = process.argv.indexOf('--out')
  if (outFlag < 0 || !process.argv[outFlag + 1])
    throw new Error('usage: build-player.mjs --out DIRECTORY')
  const result = buildPlayer({ outDir: process.argv[outFlag + 1] })
  process.stdout.write(
    `Built the self-check quiz player (${result.questionCount} questions, `
    + `${result.sectionCount} sections) in ${result.outputDirectory}.\n`,
  )
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_GITOPS,
  applyGitopsVariant,
  renderDeck,
  sections,
  validateManifest,
} from './deck-manifest.mjs'
import { resolveSelection, selectSections } from './deck-selector.mjs'

const repoRoot = resolve(import.meta.dirname, '..')
const selectionFile = '.deck-selection.md'

function commandExists(command) {
  return spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0
}

function usage() {
  return `Workshop deck launcher

Usage:
  pnpm deck -- --day 1 [--action dev|build|export]
  pnpm deck -- --day 3 [--gitops argocd|flux]
  pnpm deck -- --day optional
  pnpm deck -- --section S05
  pnpm deck -- --range S05-S09
  pnpm deck -- --list

--gitops selects the S21 GitOps tool (argocd default, or flux). Exactly one tool per
delivery; there is no "both" mode. Without an interactive terminal, pass --gitops
explicitly when you want flux (default remains argocd).

With an interactive terminal and gum installed, running without a selector opens a menu.
Without gum or a TTY, pass an explicit selector; the content superset is never selected by default.
Use --dry-run to print the resolved section IDs without starting Slidev.`
}

function gumChoose() {
  const choice = spawnSync('gum', [
    'choose',
    'Day 1', 'Day 2', 'Day 3', 'Optional / Appendix', 'One section…', 'Contiguous range…',
    '--header', 'Choose workshop content',
  ], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
  if (choice.status !== 0)
    throw new Error('Deck selection cancelled')
  const value = choice.stdout.trim()
  if (value.startsWith('Day ')) return { type: 'day', value: value.at(-1) }
  if (value === 'Optional / Appendix') return { type: 'day', value: 'optional' }

  const prompt = value === 'One section…' ? 'Section ID (for example S05)' : 'Range (for example S05-S09)'
  const input = spawnSync('gum', ['input', '--prompt', `${prompt}: `], {
    encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'],
  })
  if (input.status !== 0)
    throw new Error('Deck selection cancelled')
  return value === 'One section…'
    ? { type: 'section', value: input.stdout.trim().toUpperCase() }
    : { type: 'range', value: input.stdout.trim() }
}

function gumChooseGitops() {
  const choice = spawnSync('gum', [
    'choose',
    'Argo CD (default)',
    'Flux',
    '--header', 'S21 GitOps tool (exactly one)',
  ], { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] })
  if (choice.status !== 0)
    throw new Error('Deck selection cancelled')
  return choice.stdout.trim().startsWith('Flux') ? 'flux' : 'argocd'
}

function selectionIncludesS21(selected) {
  return selected.some((section) => section.id === 'S21')
}

function printSections(resolvedSections) {
  for (const section of resolvedSections) {
    const cut = section.canonical ? `Day ${section.day}` : 'Optional / Appendix'
    console.log(`${section.id}  ${cut.padEnd(19)} ${section.title}`)
  }
}

try {
  let selection = resolveSelection(process.argv.slice(2), {
    isTTY: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    hasGum: commandExists('gum'),
  })
  if (selection.help) {
    console.log(usage())
    process.exit(0)
  }

  let gitops = selection.gitops ?? DEFAULT_GITOPS
  let resolvedSections = applyGitopsVariant(sections, gitops)
  validateManifest(resolvedSections, { repoRoot })

  if (selection.list) {
    printSections(resolvedSections)
    process.exit(0)
  }
  if (selection.type === 'interactive')
    selection = { ...selection, ...gumChoose() }

  let selected = selectSections(resolvedSections, selection)
  if (
    selectionIncludesS21(selected)
    && !selection.gitopsExplicit
    && selection.type !== undefined
    && Boolean(process.stdin.isTTY && process.stdout.isTTY)
    && commandExists('gum')
  ) {
    gitops = gumChooseGitops()
    resolvedSections = applyGitopsVariant(sections, gitops)
    validateManifest(resolvedSections, { repoRoot })
    selected = selectSections(resolvedSections, selection)
  }

  const label = selection.type === 'day'
    ? (selection.value === 'optional' ? 'Optional / Appendix' : `Day ${selection.value}`)
    : selected.length === 1 ? `${selected[0].id} · ${selected[0].title}` : `${selected[0].id}–${selected.at(-1).id}`
  writeFileSync(resolve(repoRoot, selectionFile), renderDeck(selected, {
    title: label,
    description: 'facilitator selection',
    generated: false,
  }))
  const gitopsNote = selectionIncludesS21(selected) ? ` [gitops=${gitops}]` : ''
  console.log(`${label}: ${selected.map((section) => section.id).join(', ')}${gitopsNote}`)
  if (selection.dryRun)
    process.exit(0)

  const slidev = resolve(repoRoot, 'node_modules', '.bin', 'slidev')
  if (!existsSync(slidev))
    throw new Error('Slidev is not installed; run `pnpm install` first')
  const actionArgs = {
    dev: [selectionFile, '--open'],
    build: ['build', selectionFile, '--out', 'dist-selection'],
    export: ['export', selectionFile, '--output', 'slides-selection-export'],
  }[selection.action]
  const result = spawnSync(slidev, actionArgs, { cwd: repoRoot, stdio: 'inherit' })
  process.exit(result.status ?? 1)
} catch (error) {
  console.error(`deck: ${error.message}\n\n${usage()}`)
  process.exit(2)
}

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parse as parseDeck } from '@slidev/parser/fs'

import {
  DEFAULT_GITOPS,
  applyGitopsVariant,
  assertExactlyOneGitopsVariant,
  canonicalDayTotals,
  findGeneratedDrift,
  normalizeGitops,
  renderDeck,
  renderGeneratedDecks,
  sectionPath,
  sections as workshopSections,
  validateCanonicalScheduleTables,
  validateFrontDoorFacts,
  validatePlanningLanguage,
  validateSectionFrontmatter,
  validateStatusClaims,
  validateSyllabusCatalog,
  validateSyllabusTimings,
  validateManifest,
} from './deck-manifest.mjs'
import { checkLinks } from './link-check.mjs'
import {
  parseSelection,
  resolveSelection,
  selectSections,
} from './deck-selector.mjs'

/**
 * Non-regex HTML-comment strip (indexOf walk). A single-pass regex replace such as
 * `/<!--[\s\S]*?-->/g` is flagged by CodeQL as incomplete multi-character
 * sanitization (js/incomplete-multi-character-sanitization), because the replacement
 * can reassemble a `<!--` from the surrounding text. Walking with indexOf cannot.
 *
 * An unterminated `<!--` drops everything after it: in this deck's markdown an
 * unclosed comment means the rest of the file is speaker notes, not visible content.
 */
export function stripHtmlComments(markdown) {
  let visible = ''
  let cursor = 0
  while (cursor < markdown.length) {
    const open = markdown.indexOf('<!--', cursor)
    if (open < 0) {
      visible += markdown.slice(cursor)
      break
    }
    visible += markdown.slice(cursor, open)
    const close = markdown.indexOf('-->', open + '<!--'.length)
    if (close < 0)
      break
    cursor = close + '-->'.length
  }
  return visible
}

const section = (id, overrides = {}) => ({
  id,
  slug: `topic-${id.toLowerCase()}`,
  title: `Topic ${id}`,
  tier: 'core',
  day: 1,
  canonical: true,
  status: 'authored',
  slidesMinutes: 10,
  labMinutes: 10,
  ...overrides,
})

describe('deck manifest validation', () => {
  it('rejects a manifest whose source section is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-deck-'))
    assert.throws(
      () => validateManifest([section('S00')], { repoRoot: root }),
      /missing section source.*S00/i,
    )
  })

  it('rejects duplicate section IDs', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-deck-'))
    mkdirSync(join(root, 'pages', 'S00-topic-s00'), { recursive: true })
    writeFileSync(join(root, 'pages', 'S00-topic-s00', 'index.md'), '# S00\n')

    assert.throws(
      () => validateManifest([section('S00'), section('S00')], { repoRoot: root }),
      /duplicate section id.*S00/i,
    )
  })

  it('rejects section IDs with extra prefix or suffix characters', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-deck-'))
    mkdirSync(join(root, 'pages', 'XS00-topic-xs00'), { recursive: true })
    writeFileSync(join(root, 'pages', 'XS00-topic-xs00', 'index.md'), '# XS00\n')

    assert.throws(
      () => validateManifest([section('XS00')], { repoRoot: root }),
      /invalid manifest metadata.*XS00/i,
    )
  })

  it('rejects an authored section omitted from the manifest', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-deck-'))
    mkdirSync(join(root, 'pages', 'S00-topic-s00'), { recursive: true })
    writeFileSync(join(root, 'pages', 'S00-topic-s00', 'index.md'), '# S00\n')
    mkdirSync(join(root, 'pages', 'S01-unlisted'), { recursive: true })
    writeFileSync(join(root, 'pages', 'S01-unlisted', 'index.md'), '# S01\n')

    assert.throws(
      () => validateManifest([section('S00')], { repoRoot: root }),
      /missing authored section.*S01/i,
    )
  })

  it('reports generated deck drift instead of silently overwriting it', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-deck-'))
    writeFileSync(join(root, 'slides-day-1.md'), 'stale\n')

    assert.deepEqual(
      findGeneratedDrift(new Map([
        ['slides-day-1.md', 'fresh\n'],
        ['slides-day-2.md', 'new\n'],
      ]), { repoRoot: root }),
      ['slides-day-1.md', 'slides-day-2.md'],
    )
  })

  it('rejects contradictory section day and tier frontmatter', () => {
    assert.throws(
      () => validateSectionFrontmatter(
        section('S23', {
          day: 3,
          tier: 'recommended',
          environment: 'kind ✓ (self-install) / namespace: read-only',
        }),
        `---\nday: Day 2\nsection: '23'\ntier: optional\n---\n\n---\nlayout: lab\nenv: 'kind ✓ (self-install) / namespace: read-only'\n---\n`,
      ),
      /S23.*day.*tier/i,
    )
  })

  it('rejects a missing or YAML-unsafe environment warning', () => {
    const s23 = section('S23', {
      day: 3,
      tier: 'recommended',
      environment: 'kind ✓ (self-install) / namespace: read-only',
    })
    const base = `---\nday: Day 3\nsection: '23'\ntier: recommended\n---\n`

    assert.throws(
      () => validateSectionFrontmatter(s23, `${base}\n---\nlayout: lab\n---\n`),
      /S23.*environment/i,
    )
    assert.throws(
      () => validateSectionFrontmatter(
        s23,
        `${base}\n---\nlayout: lab\nenv: kind ✓ (self-install) / namespace: read-only\n---\n`,
      ),
      /S23.*quote.*environment/i,
    )
  })

  it('rejects contradictory authored and deferred syllabus status', () => {
    const manifest = [
      section('S23', { day: 3, tier: 'recommended', status: 'authored' }),
      section('S24', { day: 3, tier: 'optional', status: 'deferred' }),
    ]
    const catalog = `
| ID | Section | Tier | Day | Status | Track |
| --- | --- | --- | --- | --- | --- |
| S23 | Prometheus Operator | recommended | 3 | authored | Operators |
| S24 | Operator dev 101 | optional | 3 | authored | Operators |
`

    assert.throws(
      () => validateSyllabusCatalog(manifest, catalog),
      /S24.*status.*deferred/i,
    )
  })

  it('rejects duplicate IDs in syllabus status and timing tables', () => {
    const manifest = [section('S24', {
      day: 3,
      tier: 'optional',
      status: 'deferred',
      slidesMinutes: 40,
      labMinutes: 40,
    })]
    const catalog = `
| ID | Section | Tier | Day | Status | Track |
| --- | --- | --- | --- | --- | --- |
| S24 | Operator dev 101 | optional | 3 | authored | Operators |
| S24 | Operator dev 101 | optional | 3 | deferred | Operators |
`
    assert.throws(
      () => validateSyllabusCatalog(manifest, catalog),
      /duplicate.*S24.*syllabus.*catalog/i,
    )

    const timings = `
| ID | Outcome | Lab | Slides | Lab time |
| --- | --- | --- | --- | --- |
| S24 | Scaffold an operator. | lab.md | 41 | 40 |
| S24 | Scaffold an operator. | lab.md | 40 | 40 |
`
    assert.throws(
      () => validateSyllabusTimings(manifest, timings),
      /duplicate.*S24.*syllabus.*timing/i,
    )
  })

  it('requires every front-door document to identify deferred sections', () => {
    const manifest = [section('S24', { status: 'deferred', environment: 'kind-only' })]
    const documents = new Map([
      ['README.md', '**0 of 1 sections are fully authored**; S24 is deferred.'],
      ['docs/syllabus.md', 'S24 is deferred.'],
      ['docs/facilitator-guide.md', 'S24 is authored.'],
      ['labs/README.md', 'S24 is deferred.'],
      ['docs/validation-matrix.md', '| lab | S24 | `deferred` |'],
    ])
    assert.throws(
      () => validateStatusClaims(manifest, documents),
      /facilitator-guide.*S24.*deferred/i,
    )
  })

  it('rejects deferred status alongside authored, runnable, or schedulable claims', () => {
    const manifest = [section('S24', { status: 'deferred', environment: 'kind-only' })]
    const base = new Map([
      ['README.md', '**0 of 1 sections are fully authored**; S24 is deferred.'],
      ['docs/syllabus.md', 'S24 is deferred.'],
      ['docs/facilitator-guide.md', 'S24 is deferred.'],
      ['labs/README.md', 'S24 is deferred.'],
      ['docs/validation-matrix.md', '| lab | S24 deferred | `deferred` |'],
    ])
    for (const contradiction of [
      'S24 is fully authored.',
      'S24 is runnable today.',
      'S24 is schedulable as a hands-on lab.',
      'Fully authored and runnable today: S24.',
      'S24 can be scheduled as a hands-on lab.',
      'S24 can, after installing Go, be scheduled as a hands-on lab.',
      'S24 can after installing Go be scheduled as a hands-on lab.',
      'S24 may be scheduled as a hands-on lab.',
      'S24 can eventually be scheduled as a hands-on lab.',
      'S24 cannot be scheduled today, but may be scheduled as a hands-on lab.',
      'S24 may not be scheduled now, but will be scheduled as a hands-on lab.',
      'S24 must be scheduled as a hands-on lab.',
      'S24 might be scheduled as a hands-on lab.',
      'S24 would be scheduled as a hands-on lab.',
      'S24 shall be scheduled as a hands-on lab.',
      'S24 is scheduled tomorrow.',
      'S24 is scheduled for Day 3.',
      'We schedule S24 as a hands-on lab.',
      'S24 gets scheduled.',
      'S24 remains scheduled.',
      'S24 will get scheduled.',
      'S24 is going to be scheduled.',
      'S24 is, after the toolchain is installed, runnable.',
    ]) {
      const mutated = new Map(base)
      mutated.set('docs/facilitator-guide.md', `S24 is deferred. ${contradiction}`)
      assert.throws(
        () => validateStatusClaims(manifest, mutated),
        /S24.*contradict.*deferred/i,
      )
    }

    for (const validNegation of [
      "S24 isn't runnable.",
      'S24 is neither authored nor runnable.',
      'S24 cannot be scheduled as a hands-on lab.',
      "S24 can't be scheduled as a hands-on lab.",
      'S24 may not be scheduled as a hands-on lab.',
      'S24 is not schedulable.',
      'S24 is deferred and not taught; it is scheduled for a later milestone.',
      'S24 is deferred and is scheduled at a later milestone.',
      'S24 is deferred; do not schedule it as a hands-on lab.',
    ]) {
      const mutated = new Map(base)
      mutated.set('docs/facilitator-guide.md', `S24 is deferred. ${validNegation}`)
      assert.doesNotThrow(
        () => validateStatusClaims(manifest, mutated),
        validNegation,
      )
    }
  })

  it('renders deferred deck status from the manifest', () => {
    const markdown = renderDeck([
      section('S24', { status: 'deferred' }),
    ], { title: 'Optional', description: 'Optional material' })
    assert.match(markdown, /S24.*deferred.*not schedulable/i)
  })

  it('derives deck status through deferred and authored transitions', () => {
    const topic = section('S24', { status: 'deferred' })
    const deferred = renderDeck([topic], { title: 'Optional', description: 'Advanced material' })
    const authored = renderDeck(
      [{ ...topic, status: 'authored' }],
      { title: 'Optional', description: 'Advanced material' },
    )

    assert.match(deferred, /S24.*deferred.*not schedulable/i)
    assert.doesNotMatch(deferred, /all selected sections are authored/i)
    assert.match(authored, /all selected sections are authored/i)
    assert.doesNotMatch(authored, /S24.*deferred/i)
  })

  it('rejects a supplied deck description that contradicts selected status', () => {
    assert.throws(
      () => renderDeck(
        [section('S24', { status: 'deferred' })],
        { title: 'Superset', description: 'Every section is fully authored' },
      ),
      /description.*deferred.*fully authored/i,
    )
    assert.throws(
      () => renderDeck(
        [section('S24', { status: 'authored' })],
        { title: 'Superset', description: 'Includes deferred stubs' },
      ),
      /description.*authored.*deferred/i,
    )
  })

  it('derives canonical totals and rejects timing drift and measured variants', () => {
    const manifest = [
      section('S00', { canonical: true, day: 1, slidesMinutes: 30, labMinutes: 20 }),
      section('S03', { canonical: true, day: 1, slidesMinutes: 25, labMinutes: 25 }),
    ]
    assert.deepEqual(canonicalDayTotals(manifest).get(1), {
      slides: 55,
      lab: 45,
      total: 100,
    })
    assert.doesNotThrow(
      () => validatePlanningLanguage('Day 1: 100 minutes planned.', manifest),
    )
    assert.throws(
      () => validatePlanningLanguage('Day 1: 101 minutes planned.', manifest),
      /Day 1.*101.*expected.*100/i,
    )
    assert.throws(
      () => validatePlanningLanguage(
        'The actual workshop duration recorded for Day 1 was 100 minutes.',
        manifest,
      ),
      /planning estimate.*measured/i,
    )
    assert.throws(
      () => validatePlanningLanguage(
        'Day 1 took 100 minutes in the measured rehearsal run.',
        manifest,
      ),
      /planning estimate.*measured/i,
    )
  })

  it('rejects per-section timing drift from the manifest', () => {
    const manifest = [
      section('S23', { day: 3, slidesMinutes: 30, labMinutes: 25 }),
    ]
    const timings = `
| ID | Outcome | Lab | Slides | Lab time |
| --- | --- | --- | --- | --- |
| S23 | Observe an operator. | lab.md | 31 | 25 |
`
    assert.throws(
      () => validateSyllabusTimings(manifest, timings),
      /S23.*slides.*30/i,
    )
  })

  it('rejects canonical schedule table totals that drift from the manifest', () => {
    const manifest = [
      section('S00', { canonical: true, day: 1, slidesMinutes: 30, labMinutes: 20 }),
    ]
    const schedule = '| **Day 1** | **30** | **20** | **51** |\n'
    assert.throws(
      () => validateCanonicalScheduleTables(manifest, schedule),
      /Day 1.*total.*50/i,
    )
  })

  it('rejects planning estimates presented as measured timings', () => {
    assert.throws(
      () => validatePlanningLanguage('Day 1 measured time: 365 min.'),
      /planning estimate.*measured/i,
    )
    assert.throws(
      () => validatePlanningLanguage('Day 2: 345 min.'),
      /345.*planned/i,
    )
    assert.doesNotThrow(
      () => validatePlanningLanguage('Day 2: 345 min planned (unrehearsed planning estimate).'),
    )
    assert.throws(
      () => validatePlanningLanguage('Treat the totals as measured facts.'),
      /planning estimate.*measured/i,
    )
    assert.doesNotThrow(
      () => validatePlanningLanguage('The totals are neither measured facts nor actual durations.'),
    )
  })

  it('validates manifest day and environment facts in every structured front door', () => {
    const root = join(import.meta.dirname, '..')
    const paths = [
      'README.md',
      'docs/syllabus.md',
      'docs/facilitator-guide.md',
      'labs/README.md',
      'docs/validation-matrix.md',
    ]
    const base = new Map(paths.map((path) => [path, readFileSync(join(root, path), 'utf8')]))
    const manifest = workshopSections

    const readmeDay = new Map(base)
    readmeDay.set('README.md', base.get('README.md').replace(
      '`S00`, `S03`–`S08`',
      '`S00`, `S03`–`S09`',
    ))
    assert.throws(
      () => validateFrontDoorFacts(manifest, readmeDay),
      /README.*S09.*Day 2/i,
    )

    const readmeDay3 = new Map(base)
    readmeDay3.set('README.md', base.get('README.md').replace(
      '`S17`, `S20`–`S23`, `S25`–`S27`',
      '`S17`, `S20`–`S27`',
    ))
    assert.throws(
      () => validateFrontDoorFacts(manifest, readmeDay3),
      /README.*Day 3.*S24/i,
    )

    const readmeOptional = new Map(base)
    readmeOptional.set('README.md', base.get('README.md').replace(
      '`S09`–`S14`',
      '`S09`–`S15`',
    ))
    assert.throws(
      () => validateFrontDoorFacts(manifest, readmeOptional),
      /README.*Day 2.*S15/i,
    )

    const labsDay = new Map(base)
    const s09Line = base.get('labs/README.md').match(/^- \[`09-gateway-api`\].*$/m)?.[0]
    labsDay.set('labs/README.md', base.get('labs/README.md')
      .replace(`${s09Line}\n`, '')
      .replace('### Day 2', `${s09Line}\n\n### Day 2`))
    assert.throws(
      () => validateFrontDoorFacts(manifest, labsDay),
      /labs\/README.*S09.*Day 2/i,
    )

    const labsDuplicate = new Map(base)
    labsDuplicate.set('labs/README.md', base.get('labs/README.md')
      .replace('### Day 2', `${s09Line}\n\n### Day 2`))
    assert.throws(
      () => validateFrontDoorFacts(manifest, labsDuplicate),
      /labs\/README.*S09.*duplicate/i,
    )

    const matrixEnvironment = new Map(base)
    matrixEnvironment.set('docs/validation-matrix.md', base.get('docs/validation-matrix.md').replace(
      'kind ✓ (self-install stack) / namespace: read-only',
      'namespace ✓ / kind ✓',
    ))
    assert.throws(
      () => validateFrontDoorFacts(manifest, matrixEnvironment),
      /validation-matrix.*S23.*environment/i,
    )

    const matrixDuplicate = new Map(base)
    const s23MatrixRow = base.get('docs/validation-matrix.md')
      .split('\n')
      .find((line) => line.includes('| S23 Prometheus Operator |'))
    const contradictoryS23 = s23MatrixRow.replace(
      'kind ✓ (self-install stack) / namespace: read-only',
      'namespace ✓ / kind ✓',
    )
    matrixDuplicate.set('docs/validation-matrix.md', base.get('docs/validation-matrix.md')
      .replace(s23MatrixRow, `${contradictoryS23}\n${s23MatrixRow}`))
    assert.throws(
      () => validateFrontDoorFacts(manifest, matrixDuplicate),
      /validation-matrix.*duplicate.*S23.*environment/i,
    )

    const facilitatorDay = new Map(base)
    facilitatorDay.set('docs/facilitator-guide.md', base.get('docs/facilitator-guide.md').replace(
      '../labs/day-3/23-prometheus.md',
      '../labs/day-2/23-prometheus.md',
    ))
    assert.throws(
      () => validateFrontDoorFacts(manifest, facilitatorDay),
      /facilitator-guide.*S23.*Day 3/i,
    )
  })

  it('reports broken links in every configured front-door document', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-docs-'))
    writeFileSync(join(root, 'README.md'), '[missing](docs/missing.md)\n')

    const result = checkLinks({ repoRoot: root, docs: ['README.md'] })
    assert.match(result.errors.join('\n'), /missing internal target docs\/missing\.md/i)
  })
})

describe('deck selection', () => {
  const sections = [
    section('S00', { day: 1 }),
    section('S01', { day: 1, canonical: false }),
    section('S02', { day: 2 }),
    section('S03', { day: 3 }),
  ]

  it('rejects invalid day selectors', () => {
    assert.throws(() => parseSelection(['--day', '4']), /invalid day/i)
    assert.throws(() => parseSelection(['--day', 'today']), /invalid day/i)
  })

  it('accepts pnpm argument separators without changing the selection', () => {
    assert.deepEqual(
      parseSelection(['--', '--day', '2']),
      {
        type: 'day',
        value: '2',
        action: 'dev',
        list: false,
        dryRun: false,
        help: false,
        gitops: DEFAULT_GITOPS,
        gitopsExplicit: false,
      },
    )
  })

  it('accepts an explicit --gitops flux flag alongside --day', () => {
    assert.deepEqual(
      parseSelection(['--day', '3', '--gitops', 'flux']),
      {
        type: 'day',
        value: '3',
        action: 'dev',
        list: false,
        dryRun: false,
        help: false,
        gitops: 'flux',
        gitopsExplicit: true,
      },
    )
  })

  it('rejects unknown or duplicate --gitops values', () => {
    assert.throws(() => parseSelection(['--day', '3', '--gitops', 'both']), /gitops/i)
    assert.throws(() => parseSelection(['--day', '3', '--gitops']), /gitops/i)
    assert.throws(
      () => parseSelection(['--day', '3', '--gitops', 'argocd', '--gitops', 'flux']),
      /gitops/i,
    )
  })

  it('rejects the equals form --gitops=flux with guidance toward --gitops <value>', () => {
    assert.throws(
      () => parseSelection(['--day', '3', '--gitops=flux']),
      /use --gitops <value>/i,
    )
  })

  it('rejects reversed, unknown, and malformed contiguous ranges', () => {
    for (const range of ['S03-S01', 'S00-S99', 'S00,S02']) {
      const selection = parseSelection(['--range', range])
      assert.throws(() => selectSections(sections, selection), /invalid range/i)
    }
  })

  it('never chooses the superset for a noninteractive invocation', () => {
    assert.throws(
      () => resolveSelection([], { isTTY: false, hasGum: false }),
      /choose.*--day.*--section.*--range/i,
    )
  })
})

describe('deck CI contract', () => {
  it('tests the deck contract and builds every generated delivery class', () => {
    const workflow = readFileSync(
      join(import.meta.dirname, '..', '.github', 'workflows', 'ci.yml'),
      'utf8',
    )

    for (const command of [
      'pnpm run test:deck',
      'pnpm run test:pages',
      'pnpm run decks:check',
      'pnpm run build:day1',
      'pnpm run build:day2',
      'pnpm run build:day3',
      'pnpm run build:optional',
      'pnpm run build:superset',
      'pnpm run build:3day',
      'pnpm run build:templates',
    ]) {
      assert.match(workflow, new RegExp(`^\\s*${command}$`, 'm'))
    }
  })
})

describe('S21 GitOps section variant (US-GITOPS-CHOICE-A)', () => {
  it('defaults to argocd and keeps the existing S21 source path', () => {
    assert.equal(normalizeGitops(), 'argocd')
    assert.equal(normalizeGitops(undefined), 'argocd')
    assert.equal(DEFAULT_GITOPS, 'argocd')

    const resolved = applyGitopsVariant(workshopSections)
    const s21 = resolved.find((section) => section.id === 'S21')
    assert.equal(s21.slug, 'gitops')
    assert.equal(s21.title, 'GitOps with Argo CD')
    assert.equal(sectionPath(s21), './pages/S21-gitops/index.md')
  })

  it('keeps default regenerated decks byte-identical to the committed files', () => {
    const expected = renderGeneratedDecks(workshopSections)
    const root = join(import.meta.dirname, '..')
    for (const [file, content] of expected) {
      assert.equal(
        readFileSync(join(root, file), 'utf8'),
        content,
        `${file} drifted from default (argocd) render`,
      )
    }
    assert.deepEqual(findGeneratedDrift(expected, { repoRoot: root }), [])
  })

  it('selects the flux variant path when gitops=flux', () => {
    const resolved = applyGitopsVariant(workshopSections, 'flux')
    const s21 = resolved.find((section) => section.id === 'S21')
    assert.equal(s21.slug, 'gitops-flux')
    assert.equal(s21.title, 'GitOps with Flux')
    assert.equal(sectionPath(s21), './pages/S21-gitops-flux/index.md')

    const day3 = renderGeneratedDecks(workshopSections, { gitops: 'flux' }).get('slides-day-3.md')
    assert.match(day3, /src: \.\/pages\/S21-gitops-flux\/index\.md/)
    assert.doesNotMatch(day3, /src: \.\/pages\/S21-gitops\/index\.md/)
  })

  it('rejects both or neither GitOps variants in a deck that includes S21', () => {
    const both = `
# S21 · GitOps with Argo CD · recommended · Day 3 · authored
src: ./pages/S21-gitops/index.md
---
# S21 · GitOps with Flux · recommended · Day 3 · authored
src: ./pages/S21-gitops-flux/index.md
`
    assert.throws(() => assertExactlyOneGitopsVariant(both), /both.*gitops|gitops.*both/i)

    const neither = `
# S21 · GitOps · recommended · Day 3 · authored
src: ./pages/S21-missing/index.md
`
    assert.throws(() => assertExactlyOneGitopsVariant(neither), /neither.*gitops|gitops.*neither/i)

    const argocdOnly = `
# S21 · GitOps with Argo CD · recommended · Day 3 · authored
src: ./pages/S21-gitops/index.md
`
    assert.equal(assertExactlyOneGitopsVariant(argocdOnly), true)

    const noS21 = `
# S05 · Pod · core · Day 1 · authored
src: ./pages/S05-pod/index.md
`
    assert.equal(assertExactlyOneGitopsVariant(noS21), true)
  })

  it('rejects invalid gitops tool values (two tools only)', () => {
    assert.throws(() => normalizeGitops('both'), /argocd|flux/i)
    assert.throws(() => normalizeGitops(''), /argocd|flux/i)
    assert.throws(() => normalizeGitops('tekton'), /argocd|flux/i)
  })

  it('fails clearly when the flux variant source is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'workshop-gitops-'))
    mkdirSync(join(root, 'pages', 'S21-gitops'), { recursive: true })
    writeFileSync(join(root, 'pages', 'S21-gitops', 'index.md'), '# argocd\n')

    const fluxManifest = applyGitopsVariant([
      section('S21', {
        slug: 'gitops',
        title: 'GitOps with Argo CD',
        day: 3,
        tier: 'recommended',
      }),
    ], 'flux')

    assert.throws(
      () => validateManifest(fluxManifest, { repoRoot: root }),
      /S21-gitops-flux|flux variant|missing section source.*S21/i,
    )
  })
})

describe('S21 GitOps Flux section variant (US-GITOPS-CHOICE-B)', () => {
  const root = join(import.meta.dirname, '..')
  const argocdPath = join(root, 'pages', 'S21-gitops', 'index.md')
  const fluxPath = join(root, 'pages', 'S21-gitops-flux', 'index.md')

  function slideSeparatorCount(markdown) {
    return markdown.split(/^---\s*$/m).length - 1
  }

  it('authors the flux section source and validates the flux manifest path', () => {
    assert.equal(existsSync(fluxPath), true, 'pages/S21-gitops-flux/index.md must exist')
    const resolved = applyGitopsVariant(workshopSections, 'flux')
    assert.equal(validateManifest(resolved, { repoRoot: root }), true)
    assert.equal(
      validateSectionFrontmatter(
        resolved.find((section) => section.id === 'S21'),
        readFileSync(fluxPath, 'utf8'),
      ),
      true,
    )
  })

  it('keeps slide-separator count within ±1 of the Argo CD variant', () => {
    const argocd = slideSeparatorCount(readFileSync(argocdPath, 'utf8'))
    const flux = slideSeparatorCount(readFileSync(fluxPath, 'utf8'))
    assert.ok(
      Math.abs(flux - argocd) <= 1,
      `flux separators ${flux} vs argocd ${argocd} (parity ±1)`,
    )
  })

  it('covers the Flux beat vocabulary (CRDs, prune/suspend, CLI, OpenGitOps callout)', () => {
    const flux = readFileSync(fluxPath, 'utf8')
    assert.match(flux, /controller="Flux"/)
    assert.match(flux, /source\.toolkit\.fluxcd\.io/)
    assert.match(flux, /kustomize\.toolkit\.fluxcd\.io/)
    assert.match(flux, /helm\.toolkit\.fluxcd\.io/)
    assert.match(flux, /\bGitRepository\b/)
    assert.match(flux, /\bKustomization\b/)
    assert.match(flux, /\bHelmRelease\b/)
    assert.match(flux, /\bprune:\s*true\b/)
    assert.match(flux, /\bsuspend\b/)
    assert.match(flux, /Argo CD/)
    assert.match(flux, /labs\/day-3\/21-gitops-flux\.md/)
  })

  it('locks each claimed on-slide CLI verb into learner-visible content', () => {
    const flux = readFileSync(fluxPath, 'utf8')
    const visible = stripHtmlComments(flux)

    for (const verb of ['install', 'get', 'reconcile', 'suspend']) {
      assert.match(
        visible,
        new RegExp(`flux ${verb}`),
        `\`flux ${verb}\` must appear on-slide (outside HTML comments)`,
      )
    }
  })

  it('keeps bootstrap and resume as speaker-notes-only verbs, per the accuracy locks', () => {
    const flux = readFileSync(fluxPath, 'utf8')
    const visible = stripHtmlComments(flux)

    for (const verb of ['bootstrap', 'resume']) {
      assert.doesNotMatch(
        visible,
        new RegExp(`flux ${verb}`),
        `\`flux ${verb}\` must stay speaker-notes-only; if it moves on-slide, update the locks and this test`,
      )
      assert.match(
        flux,
        new RegExp(`flux ${verb}`),
        `\`flux ${verb}\` must still be covered in speaker notes / comments`,
      )
    }

    const onSlideClaim = /CLI verbs used on-slide:([\s\S]*?)(?:Speaker-notes-only|\n- |\n\n)/
      .exec(flux)?.[1] ?? ''
    assert.notEqual(onSlideClaim, '', 'ACCURACY LOCKS must keep the on-slide CLI verbs claim')
    assert.doesNotMatch(
      onSlideClaim,
      /bootstrap|resume/,
      'ACCURACY LOCKS must not claim bootstrap/resume as on-slide verbs',
    )
    assert.match(
      flux,
      /(speaker-)?notes-only:.*`flux bootstrap`.*`flux resume`/is,
      'ACCURACY LOCKS must name bootstrap/resume as notes-only verbs',
    )
  })
})

describe('generate-decks --gitops parsing (fail closed)', () => {
  const root = join(import.meta.dirname, '..')

  function runGenerateDecks(args) {
    return spawnSync(
      process.execPath,
      [join(root, 'scripts', 'generate-decks.mjs'), ...args],
      { cwd: root, encoding: 'utf8' },
    )
  }

  it('rejects a bare --gitops flag instead of defaulting silently', () => {
    const result = runGenerateDecks(['--check', '--gitops'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /missing --gitops value.*argocd.*flux/i)
  })

  it('rejects a --gitops flag whose value is another flag', () => {
    const result = runGenerateDecks(['--gitops', '--check'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /missing --gitops value.*argocd.*flux/i)
  })

  it('rejects duplicate --gitops flags instead of keeping the first', () => {
    const result = runGenerateDecks(['--check', '--gitops', 'argocd', '--gitops', 'flux'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /--gitops at most once.*argocd.*flux/i)
  })

  it('rejects invalid --gitops values with a clean message, not a stack trace', () => {
    const result = runGenerateDecks(['--check', '--gitops', 'both'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /argocd|flux/i)
    assert.doesNotMatch(result.stderr, /at .*generate-decks\.mjs:\d+/)
  })

  it('rejects the equals form --gitops=flux instead of silently defaulting to argocd', () => {
    const result = runGenerateDecks(['--check', '--gitops=flux'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /use --gitops <value>/i)
  })

  it('rejects unknown options such as a typo of --gitops instead of exiting 0', () => {
    const result = runGenerateDecks(['--check', '--gitpos', 'flux'])
    assert.equal(result.status, 1, `expected exit 1, got ${result.status}\n${result.stderr}`)
    assert.match(result.stderr, /unknown option --gitpos/i)
  })
})

/**
 * US-FIX-ANIM-CLICKS — a bound animation only runs if its slide reserves clicks.
 *
 * Slidev derives a slide's click total from `clicksTotalOverrides ?? max(registered
 * clicks)` (@slidev/client `composables/useClicks.ts`), so `clicks:` in frontmatter is
 * an OVERRIDE, not a floor, and in-body `v-click` / `v-clicks` / `magic-move` elements
 * reserve a budget on their own. A slide that binds `:step="$clicks"` but reserves
 * fewer clicks than the bound component documents renders frozen at the last reachable
 * step — `slidev build` cannot catch this, because the deck still parses.
 *
 * `registeredClicks` mirrors Slidev's runtime accounting. It was validated against 21
 * live measurements (drive the dev server, press ArrowRight until the slide number
 * changes, count the presses) and reproduced every measured total exactly.
 */

/** Click budget a slide body reserves, mirroring Slidev's runtime accounting. */
export function registeredClicks(content) {
  let cursor = 0
  let max = 0
  let fence = null
  let magic = null
  let vclicks = null

  const bump = (n) => {
    cursor = Math.max(cursor, n)
    max = Math.max(max, n)
  }

  // Speaker notes are HTML comments and reserve nothing — strip them before counting.
  for (const line of stripHtmlComments(content).split('\n')) {
    // `md magic-move` container (4+ backticks): N inner frames reserve N-1 clicks.
    const magicOpen = line.match(/^\s*(`{4,})\s*md\s+magic-move/)
    if (!magic && magicOpen) {
      magic = { marker: magicOpen[1], fences: 0 }
      continue
    }
    if (magic) {
      if (line.trim() === magic.marker) {
        bump(cursor + Math.max(0, magic.fences / 2 - 1))
        magic = null
      } else if (/^\s*```/.test(line)) {
        magic.fences += 1
      }
      continue
    }

    // Nothing inside a plain code fence registers a click.
    const fenceMark = line.match(/^\s*(`{3,}|~{3,})/)
    if (fence) {
      if (fenceMark && line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fenceMark) {
      fence = fenceMark[1]
      continue
    }

    // <v-clicks [at="N"]> … </v-clicks> — one click per top-level list item.
    if (vclicks) {
      if (/<\/v-clicks>/.test(line)) {
        const start = vclicks.start ?? cursor + 1
        if (vclicks.items > 0) bump(start + vclicks.items - 1)
        vclicks = null
      } else if (/^[-*+]\s+\S/.test(line)) {
        vclicks.items += 1
      }
      continue
    }
    const vclicksOpen = line.match(/<v-clicks(\s[^>]*)?>/)
    if (vclicksOpen) {
      const at = (vclicksOpen[1] || '').match(/\bat="(\d+)"/)
      vclicks = { start: at ? Number(at[1]) : null, items: 0 }
      continue
    }

    if (/<\/v-click>/.test(line)) continue

    const explicit = line.match(/\bv-click="(\d+)"/)
    if (explicit) {
      bump(Number(explicit[1]))
      continue
    }
    const atForm = line.match(/<v-click\s+at="(\d+)"/)
    if (atForm) {
      bump(Number(atForm[1]))
      continue
    }
    if (/\bv-after\b/.test(line)) continue
    if (/\bv-click\b/.test(line)) bump(cursor + 1)
  }

  return max
}

/** Effective click total Slidev will use for a slide. */
export function slideClickBudget(slide) {
  const override = slide.frontmatter?.clicks
  return typeof override === 'number' ? override : registeredClicks(slide.content)
}

/** Highest `step N:` a component's header comment documents, or null if undocumented. */
export function documentedMaxStep(repoRoot, component) {
  const file = join(repoRoot, 'components', `${component}.vue`)
  if (!existsSync(file)) return null
  const header = readFileSync(file, 'utf8').match(/\/\*\*[\s\S]*?\*\//)
  if (!header) return null
  const steps = [...header[0].matchAll(/^\s*\*\s*step\s+(\d+)\s*:/gim)].map((m) => Number(m[1]))
  return steps.length ? Math.max(...steps) : null
}

/** Section-library files plus the standalone galleries (generated roots only import). */
function clickableDeckFiles(repoRoot) {
  return readdirSync(join(repoRoot, 'pages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join('pages', entry.name, 'index.md'))
    .concat(['slides-templates.md', 'slides-showcase.md'])
    .filter((rel) => existsSync(join(repoRoot, rel)))
}

/** Every slide that binds `:step="$clicks"`, with the budget it actually reserves. */
async function collectClickBoundSlides(repoRoot) {
  const found = []
  for (const rel of clickableDeckFiles(repoRoot)) {
    const abs = join(repoRoot, rel)
    const deck = await parseDeck(readFileSync(abs, 'utf8'), abs)
    for (const slide of deck.slides) {
      for (const match of slide.content.matchAll(/<([A-Z][A-Za-z0-9]*)[^>]*:step="\$clicks"/g)) {
        found.push({
          slide: rel,
          line: slide.start + 1,
          heading: (slide.content.match(/^#\s+(.*)$/m) || [])[1] || '(untitled)',
          component: match[1],
          budget: slideClickBudget(slide),
          declared: slide.frontmatter?.clicks ?? null,
        })
      }
    }
  }
  return found
}

describe('animated component click budgets (US-FIX-ANIM-CLICKS)', () => {
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

  it('discovers the deck\'s animated slides (guards the collector against matching nothing)', async () => {
    const bound = await collectClickBoundSlides(repoRoot)
    assert.ok(
      bound.length >= 20,
      `expected the deck's :step="$clicks" bindings to be discovered, found ${bound.length}`,
    )
  })

  it('every component bound with :step="$clicks" documents its step contract', async () => {
    const bound = await collectClickBoundSlides(repoRoot)
    const undocumented = [...new Set(bound.map((b) => b.component))]
      .filter((component) => documentedMaxStep(repoRoot, component) === null)
      .sort()
    assert.deepEqual(
      undocumented,
      [],
      'each components/<name>.vue header comment must enumerate its "step N:" beats — ' +
        `that comment is the contract a slide's click budget has to cover: ${undocumented.join(', ')}`,
    )
  })

  it('every slide binding :step="$clicks" reserves a budget >= the component max step', async () => {
    const bound = await collectClickBoundSlides(repoRoot)
    const starved = bound
      .map((b) => ({ ...b, maxStep: documentedMaxStep(repoRoot, b.component) }))
      .filter((b) => b.maxStep !== null && b.budget < b.maxStep)
      .map(
        (b) =>
          `${b.slide}:${b.line} "${b.heading}" — <${b.component}> documents steps 0..${b.maxStep} ` +
          `but the slide reserves only ${b.budget} click(s), so it freezes at step ${b.budget}. ` +
          `Missing budget: ${b.maxStep - b.budget} (add "clicks: ${b.maxStep}" to the slide frontmatter).`,
      )
    assert.deepEqual(
      starved,
      [],
      `slides whose animation cannot reach its last documented step:\n  ${starved.join('\n  ')}`,
    )
  })

  it('an explicit clicks: override never shrinks a budget the slide body already reserves', async () => {
    const shrunk = []
    for (const rel of clickableDeckFiles(repoRoot)) {
      const abs = join(repoRoot, rel)
      const deck = await parseDeck(readFileSync(abs, 'utf8'), abs)
      for (const slide of deck.slides) {
        const declared = slide.frontmatter?.clicks
        if (typeof declared !== 'number') continue
        const inBody = registeredClicks(slide.content)
        if (declared < inBody) {
          shrunk.push(
            `${rel}:${slide.start + 1} declares "clicks: ${declared}" but its body reserves ${inBody}`,
          )
        }
      }
    }
    assert.deepEqual(
      shrunk,
      [],
      `clicks: is an override, not a floor — these slides lose steps:\n  ${shrunk.join('\n  ')}`,
    )
  })
})

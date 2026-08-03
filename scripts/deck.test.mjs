import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  canonicalDayTotals,
  findGeneratedDrift,
  renderDeck,
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
      { type: 'day', value: '2', action: 'dev', list: false, dryRun: false, help: false },
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

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const sectionTimings = {
  S00: [20, 15], S01: [30, 25], S02: [30, 25], S03: [30, 20],
  S04: [25, 25], S05: [30, 25], S06: [35, 30], S07: [30, 30],
  S08: [25, 25], S09: [30, 25], S10: [25, 25], S11: [30, 30],
  S12: [30, 30], S13: [30, 30], S14: [30, 30], S15: [20, 20],
  S16: [20, 20], S17: [30, 25], S18: [25, 25], S19: [25, 25],
  S20: [30, 30], S21: [30, 25], S22: [25, 15], S23: [30, 25],
  S24: [40, 40], S25: [35, 30], S26: [30, 40], S27: [20, 0],
}

const sectionDefinitions = [
  { id: 'S00', slug: 'welcome', title: 'Welcome & setup', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S01', slug: 'containers', title: 'Containers', tier: 'recommended', day: 1, canonical: false, status: 'authored', environment: 'local — no cluster needed' },
  { id: 'S02', slug: 'container-security', title: 'Container security & supply chain', tier: 'recommended', day: 1, canonical: false, status: 'authored', environment: 'local — no cluster needed' },
  { id: 'S03', slug: 'mental-model', title: 'Kubernetes mental model', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ (read-only alt) / kind ✓' },
  { id: 'S04', slug: 'kubectl', title: 'kubectl', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S05', slug: 'pod', title: 'Pod', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S06', slug: 'deployment', title: 'Deployment', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S07', slug: 'service', title: 'Service', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S08', slug: 'ingress', title: 'Ingress', tier: 'core', day: 1, canonical: true, status: 'authored', environment: 'kind ✓ (controller install) · namespace ✓ (shared controller)' },
  { id: 'S09', slug: 'gateway-api', title: 'Gateway API', tier: 'recommended', day: 2, canonical: true, status: 'authored', environment: 'kind ✓ (CRDs + controller install) · namespace ✓ (CRDs/controller pre-provided)' },
  { id: 'S10', slug: 'config', title: 'ConfigMap & Secret', tier: 'core', day: 2, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S11', slug: 'storage', title: 'Storage (PV/PVC/StorageClass)', tier: 'core', day: 2, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S12', slug: 'statefulset', title: 'StatefulSet', tier: 'recommended', day: 2, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S13', slug: 'resources', title: 'Resources & limits', tier: 'core', day: 2, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S14', slug: 'probes', title: 'Health probes', tier: 'core', day: 2, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S15', slug: 'jobs', title: 'Jobs & CronJobs', tier: 'recommended', day: 2, canonical: false, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S16', slug: 'hpa', title: 'Autoscaling (HPA)', tier: 'optional', day: 2, canonical: false, status: 'authored', environment: 'kind ✓ (metrics-server) / namespace read-only' },
  { id: 'S17', slug: 'pod-security', title: 'Pod security', tier: 'core', day: 3, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S18', slug: 'networkpolicy', title: 'NetworkPolicy', tier: 'recommended', day: 3, canonical: false, status: 'authored', environment: 'kind ✓ (policy CNI) / namespace: read-only' },
  { id: 'S19', slug: 'rbac', title: 'RBAC', tier: 'optional', day: 3, canonical: false, status: 'authored', environment: 'namespace ✓ / kind ✓  (--as needs impersonate rights — see the lab note)' },
  { id: 'S20', slug: 'helm', title: 'Helm', tier: 'core', day: 3, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S21', slug: 'gitops', title: 'GitOps with Argo CD', tier: 'recommended', day: 3, canonical: true, status: 'authored', environment: 'kind-only / facilitator-hosted (namespace = read-only)' },
  { id: 'S22', slug: 'operator-pattern', title: 'The operator pattern', tier: 'recommended', day: 3, canonical: true, status: 'authored', environment: 'namespace ✓ (read-only) / kind ✓ (self-install)' },
  { id: 'S23', slug: 'prometheus-operator', title: 'Prometheus Operator', tier: 'recommended', day: 3, canonical: true, status: 'authored', environment: 'kind ✓ (self-install) / namespace: read-only' },
  { id: 'S24', slug: 'kubebuilder', title: 'Operator dev 101 (kubebuilder)', tier: 'optional', day: 3, canonical: false, status: 'deferred', environment: 'kind-only · advanced' },
  { id: 'S25', slug: 'pod-escape', title: 'Security & pod escape', tier: 'recommended', day: 3, canonical: true, status: 'authored', environment: 'kind-only · strictly defensive' },
  { id: 'S26', slug: 'best-practices', title: 'Best practices', tier: 'core', day: 3, canonical: true, status: 'authored', environment: 'namespace ✓ / kind ✓' },
  { id: 'S27', slug: 'wrap-up', title: 'Wrap-up & next steps', tier: 'core', day: 3, canonical: true, status: 'authored' },
]

export const sections = sectionDefinitions.map((section) => {
  const [slidesMinutes, labMinutes] = sectionTimings[section.id] ?? []
  return { ...section, slidesMinutes, labMinutes }
})

export const generatedDecks = [
  { file: 'slides-day-1.md', title: 'Day 1', description: 'Foundations and the core red line', select: (s) => s.day === 1 && s.canonical },
  { file: 'slides-day-2.md', title: 'Day 2', description: 'Modern routing and running workloads well', select: (s) => s.day === 2 && s.canonical },
  { file: 'slides-day-3.md', title: 'Day 3', description: 'Security, delivery, operators, and best practices', select: (s) => s.day === 3 && s.canonical },
  { file: 'slides-optional.md', title: 'Optional / Appendix', description: 'On-ramp, add-backs, and advanced material', select: (s) => !s.canonical },
  { file: 'slides-3day.md', title: '3-day compatibility cut', description: 'The three canonical days in one compatibility deck', select: (s) => s.canonical },
  { file: 'slides.md', title: 'Content superset', description: 'Compatibility deck containing every section source', select: () => true },
]

export function sectionPath(section) {
  return `./pages/${section.id}-${section.slug}/index.md`
}

export function validateManifest(manifest = sections, { repoRoot = resolve(import.meta.dirname, '..') } = {}) {
  const seenIds = new Set()
  const seenPaths = new Set()
  for (const section of manifest) {
    if (seenIds.has(section.id))
      throw new Error(`Duplicate section ID ${section.id}`)
    seenIds.add(section.id)

    const source = sectionPath(section)
    if (seenPaths.has(source))
      throw new Error(`Duplicate section source ${source}`)
    seenPaths.add(source)

    if (!/^S\d{2}$/.test(section.id) || ![1, 2, 3].includes(section.day)
      || !['core', 'recommended', 'optional'].includes(section.tier)
      || !['authored', 'deferred'].includes(section.status)
      || !Number.isInteger(section.slidesMinutes) || section.slidesMinutes < 0
      || !Number.isInteger(section.labMinutes) || section.labMinutes < 0) {
      throw new Error(`Invalid manifest metadata for ${section.id}`)
    }
    if (!existsSync(resolve(repoRoot, source)))
      throw new Error(`Missing section source for ${section.id}: ${source}`)
  }

  const pagesRoot = resolve(repoRoot, 'pages')
  if (existsSync(pagesRoot)) {
    const authored = readdirSync(pagesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^S\d{2}-/.test(entry.name))
      .map((entry) => entry.name.slice(0, 3))
    const omitted = authored.filter((id) => !seenIds.has(id))
    if (omitted.length)
      throw new Error(`Manifest is missing authored section(s): ${omitted.join(', ')}`)
  }
  return true
}

function frontmatterBlocks(markdown) {
  return markdown.split(/^---\s*$/m).map((block) => block.trim())
}

function scalar(block, key) {
  const match = block.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
  if (!match)
    return undefined
  const raw = match[1].trim()
  const quoted = (raw.startsWith("'") && raw.endsWith("'"))
    || (raw.startsWith('"') && raw.endsWith('"'))
  return { raw, value: quoted ? raw.slice(1, -1) : raw, quoted }
}

export function validateSectionFrontmatter(section, markdown) {
  const blocks = frontmatterBlocks(markdown)
  const cover = blocks.find((block) => scalar(block, 'layout')?.value === 'section-cover')
    ?? blocks.find((block) => scalar(block, 'day'))
    ?? ''
  const problems = []
  if (scalar(cover, 'day')?.value !== `Day ${section.day}`)
    problems.push(`day must be Day ${section.day}`)
  if (scalar(cover, 'section')?.value !== section.id.slice(1))
    problems.push(`section must be '${section.id.slice(1)}'`)
  if (scalar(cover, 'tier')?.value !== section.tier)
    problems.push(`tier must be ${section.tier}`)

  if (section.environment) {
    const lab = blocks.find((block) => scalar(block, 'layout')?.value === 'lab')
    const env = lab && scalar(lab, 'env')
    if (!env)
      problems.push('environment warning is missing from the lab frontmatter')
    else {
      if (env.raw.includes(': ') && !env.quoted)
        problems.push('quote the environment warning because it contains a YAML colon')
      if (env.value !== section.environment)
        problems.push(`environment must be ${section.environment}`)
    }
  }
  else if (blocks.some((block) => scalar(block, 'layout')?.value === 'lab')) {
    problems.push('manifest environment is missing for a section with a lab')
  }

  if (problems.length)
    throw new Error(`${section.id} frontmatter contradiction: ${problems.join('; ')}`)
  return true
}

export function validateSyllabusCatalog(manifest, markdown) {
  const rows = new Map()
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    if (/^S\d{2}$/.test(cells[0] ?? '')
      && ['core', 'recommended', 'optional'].includes(cells[2])
      && /^[123]$/.test(cells[3] ?? ''))
      rows.set(cells[0], cells)
  }
  for (const section of manifest) {
    const row = rows.get(section.id)
    if (!row)
      throw new Error(`${section.id} is missing from the syllabus catalog`)
    const [, , tier, day, status] = row
    const problems = []
    if (tier !== section.tier)
      problems.push(`tier must be ${section.tier}`)
    if (day !== String(section.day))
      problems.push(`day must be ${section.day}`)
    if (status !== section.status)
      problems.push(`status must be ${section.status}`)
    if (problems.length)
      throw new Error(`${section.id} syllabus contradiction: ${problems.join('; ')}`)
  }
  return true
}

export function validateSyllabusTimings(manifest, markdown) {
  const rows = new Map()
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    const id = cells[0]?.match(/^S\d{2}/)?.[0]
    if (!id || cells.length !== 5 || !/^\d+$/.test(cells[3] ?? '')
      || !/^(?:\d+|—)$/.test(cells[4] ?? ''))
      continue
    rows.set(id, { slides: Number(cells[3]), lab: cells[4] === '—' ? 0 : Number(cells[4]) })
  }
  for (const section of manifest) {
    const row = rows.get(section.id)
    if (!row)
      throw new Error(`${section.id} is missing from the syllabus timing table`)
    const problems = []
    if (row.slides !== section.slidesMinutes)
      problems.push(`slides must be ${section.slidesMinutes}`)
    if (row.lab !== section.labMinutes)
      problems.push(`lab time must be ${section.labMinutes}`)
    if (problems.length)
      throw new Error(`${section.id} syllabus timing contradiction: ${problems.join('; ')}`)
  }
  return true
}

export function canonicalDayTotals(manifest = sections) {
  const totals = new Map([1, 2, 3].map((day) => [day, { slides: 0, lab: 0, total: 0 }]))
  for (const section of manifest.filter((item) => item.canonical)) {
    const day = totals.get(section.day)
    day.slides += section.slidesMinutes
    day.lab += section.labMinutes
    day.total += section.slidesMinutes + section.labMinutes
  }
  return totals
}

export function validateCanonicalScheduleTables(manifest, markdown) {
  const expected = canonicalDayTotals(manifest)
  const found = new Map()
  for (const line of markdown.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replaceAll('*', '').trim())
    const match = cells[0]?.match(/^Day ([123])$/)
    if (match && cells.length === 4 && cells.slice(1).every((cell) => /^\d+$/.test(cell)))
      found.set(Number(match[1]), cells.slice(1).map(Number))
  }
  for (const [day, totals] of expected) {
    if (totals.total === 0)
      continue
    const row = found.get(day)
    if (!row)
      throw new Error(`Day ${day} canonical schedule total row is missing`)
    const [slides, lab, total] = row
    if (slides !== totals.slides || lab !== totals.lab || total !== totals.total) {
      throw new Error(
        `Day ${day} canonical schedule must be slides ${totals.slides}, lab ${totals.lab}, total ${totals.total}`,
      )
    }
  }
  return true
}

export function validatePlanningLanguage(markdown, manifest = sections) {
  const measuredNumber = /\b(?:measured|actual)\b[^\n.]{0,120}\b\d+\s*(?:min(?:ute)?s?)\b/i
  const measuredNumberReverse = /\b\d+\s*(?:min(?:ute)?s?)\b[^\n.]{0,120}\b(?:measured|actual)\b/i
  const statements = markdown.replaceAll('\n', ' ').split(/(?<=[.!?])\s+/)
  for (const statement of statements) {
    const withoutNegations = statement
      .replace(
        /\bneither\s+(?:measured|actual)\s+(?:facts?|timings?|durations?|totals?|time)\s+nor\s+(?:measured|actual)\s+(?:facts?|timings?|durations?|totals?|time)\b/gi,
        '',
      )
      .replace(
        /\b(?:not|never|isn['’]t|aren['’]t|is not|are not|was not|were not)\s+(?:actually\s+)?(?:measured|actual)\b/gi,
        '',
      )
    const timingSubject = /\b(?:facts?|timings?|durations?|totals?|time)\b/i
    if (measuredNumber.test(withoutNegations) || measuredNumberReverse.test(withoutNegations))
      throw new Error('An unrehearsed planning estimate is presented as measured timing')
    if (/\b(?:measured|actual)\b/i.test(withoutNegations) && timingSubject.test(withoutNegations))
      throw new Error('An unrehearsed planning estimate is presented as measured timing')
  }
  const totals = canonicalDayTotals(manifest)
  for (const line of markdown.split('\n')) {
    const durations = line.matchAll(/\bDay ([123])\b[^\n]{0,80}?\b(\d+)\s*(?:min(?:ute)?s?)\b/gi)
    for (const match of durations) {
      const day = Number(match[1])
      const value = Number(match[2])
      const expected = totals.get(day)?.total
      if (value !== expected)
        throw new Error(`Day ${day} claims ${value} minutes; expected planning total ${expected}`)
      if (!/\b(?:planned|planning|estimate|target|unrehearsed)\b/i.test(line))
        throw new Error(`${value} min day total must be labelled planned or estimated`)
    }
  }
  return true
}

function sectionIds(value) {
  const ids = []
  const pattern = /S(\d{2})(?:`?\s*[–-]\s*`?S?(\d{2}))?/g
  for (const match of value.matchAll(pattern)) {
    const start = Number(match[1])
    const end = Number(match[2] ?? match[1])
    if (end < start)
      continue
    for (let number = start; number <= end; number++)
      ids.push(`S${String(number).padStart(2, '0')}`)
  }
  return ids
}

function environmentProfile(value) {
  const environment = value.replace(/[*_`]/g, '').toLowerCase()
  if (/\blocal\b[^.;|]{0,40}\bno cluster\b/.test(environment))
    return 'local'
  const hasKind = /\bkind\s*✓|\bkind-only\b/.test(environment)
  const namespaceReadOnly = /\b(?:namespace|shared\s+ns)\b[^.;|]{0,80}\bread-only\b/.test(environment)
  const namespaceFull = /\bnamespace\s*✓/.test(environment) && !namespaceReadOnly
  if (hasKind && namespaceReadOnly)
    return 'kind-with-namespace-read-only'
  if (hasKind && namespaceFull)
    return 'namespace-and-kind'
  if (hasKind && /\bkind-only\b/.test(environment))
    return 'kind-only'
  return undefined
}

export function validateFrontDoorFacts(manifest, documents) {
  const byId = new Map(manifest.map((section) => [section.id, section]))

  const syllabus = documents.get('docs/syllabus.md') ?? ''
  validateSyllabusCatalog(manifest, syllabus)

  const readme = documents.get('README.md') ?? ''
  const readmeAssignments = new Map()
  for (const line of readme.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.replaceAll('*', '').trim())
    const day = Number(cells[0]?.match(/^Day ([123])$/)?.[1])
    if (!day || cells.length < 3)
      continue
    for (const id of sectionIds(cells[2])) {
      const assignments = readmeAssignments.get(id) ?? new Set()
      assignments.add(day)
      readmeAssignments.set(id, assignments)
    }
  }
  for (const section of manifest.filter((item) => item.canonical)) {
    const assignments = readmeAssignments.get(section.id) ?? new Set()
    const wrongDay = [...assignments].find((day) => day !== section.day)
    if (!assignments.has(section.day) || wrongDay) {
      const claim = wrongDay ? `assigns ${section.id} to Day ${wrongDay}` : `does not assign ${section.id}`
      throw new Error(`README.md ${claim}; manifest requires Day ${section.day}`)
    }
  }

  const labsReadme = documents.get('labs/README.md') ?? ''
  let labsDay
  const labAssignments = new Map()
  for (const line of labsReadme.split('\n')) {
    if (/^##\s/.test(line))
      labsDay = undefined
    const heading = line.match(/^### Day ([123])\b/)
    if (heading)
      labsDay = Number(heading[1])
    if (labsDay) {
      for (const match of line.matchAll(/\.\/day-[123]\/(\d{2})-[^)]+\.md/g))
        labAssignments.set(`S${match[1]}`, labsDay)
    }
  }
  for (const section of manifest.filter((item) => item.environment)) {
    const assigned = labAssignments.get(section.id)
    if (assigned !== section.day) {
      const claim = assigned ? `groups ${section.id} under Day ${assigned}` : `does not list ${section.id}`
      throw new Error(`labs/README.md ${claim}; manifest requires Day ${section.day}`)
    }
  }

  const facilitator = documents.get('docs/facilitator-guide.md') ?? ''
  let facilitatorReferences = 0
  for (const match of facilitator.matchAll(/\.\.\/labs\/day-([123])\/(\d{2})-[^)]+\.md/g)) {
    const section = byId.get(`S${match[2]}`)
    if (!section)
      continue
    facilitatorReferences++
    const claimedDay = Number(match[1])
    if (claimedDay !== section.day) {
      throw new Error(
        `docs/facilitator-guide.md assigns ${section.id} to Day ${claimedDay}; manifest requires Day ${section.day}`,
      )
    }
  }
  if (!facilitatorReferences)
    throw new Error('docs/facilitator-guide.md must contain manifest-checkable lab references')

  const matrix = documents.get('docs/validation-matrix.md') ?? ''
  const matrixEnvironments = new Map()
  for (const line of matrix.split('\n')) {
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim())
    const id = cells[1]?.match(/\bS\d{2}\b/)?.[0]
    if (id && cells.length >= 6)
      matrixEnvironments.set(id, cells[2])
  }
  for (const section of manifest.filter((item) => item.environment)) {
    const claimed = matrixEnvironments.get(section.id)
    if (!claimed)
      throw new Error(`docs/validation-matrix.md is missing the ${section.id} environment`)
    const expectedProfile = environmentProfile(section.environment)
    const claimedProfile = environmentProfile(claimed)
    if (!expectedProfile || claimedProfile !== expectedProfile) {
      throw new Error(
        `docs/validation-matrix.md ${section.id} environment contradicts the manifest (${expectedProfile ?? section.environment})`,
      )
    }
  }
  return true
}

export function validateStatusClaims(manifest, documents) {
  const deferred = manifest.filter((section) => section.status === 'deferred')
  const authoredWithLabs = manifest.filter((section) => section.status === 'authored' && section.environment)
  const readme = documents.get('README.md') ?? ''
  if (!readme.includes(`**${authoredWithLabs.length} of ${manifest.length} sections are fully authored**`))
    throw new Error(`README authored status must say ${authoredWithLabs.length} of ${manifest.length}`)

  for (const [path, markdown] of documents) {
    for (const section of deferred) {
      const forward = new RegExp(`${section.id}[\\s\\S]{0,240}deferred`, 'i')
      const reverse = new RegExp(`deferred[\\s\\S]{0,240}${section.id}`, 'i')
      if (!forward.test(markdown) && !reverse.test(markdown))
        throw new Error(`${path} must identify ${section.id} as deferred`)
      const blocks = markdown.split(/\n\s*\n/)
      const statements = blocks.flatMap((block) => block.startsWith('|')
        ? block.split('\n')
        : block.replaceAll('\n', ' ').split(/(?<=[.!?])\s+/))
      for (const statement of statements.filter((item) => item.includes(section.id))) {
        const withoutNegations = statement
          .replace(/[*_>`#]/g, ' ')
          .replace(/\b\d+\s+of\s+\d+\s+sections are fully authored\b/gi, '')
          .replace(/\b(?:is\s+)?neither\s+(?:fully\s+)?(?:authored|runnable|schedulable)(?:\s+nor\s+(?:fully\s+)?(?:authored|runnable|schedulable))+\b/gi, '')
          .replace(/\bisn['’]t(?:\s+\w+){0,3}\s+(?:fully\s+)?(?:authored|runnable|schedulable)\b/gi, '')
          .replace(/\bnot(?:\s+\w+){0,3}\s+(?:fully\s+)?(?:authored|runnable|schedulable)\b/gi, '')
          .replace(/\b(?:cannot|can['’]t|may not|could not|must not|should not|will not|won['’]t|never)\b[^.!?;]{0,100}\b(?:be\s+)?scheduled\b/gi, '')
          .replace(/\bunauthored\b/gi, '')
        const positiveClaim = /\bfully authored\b|\brunnable\b|\bschedulable\b|\bis(?:\s*,[^,]+,)?\s+authored\b/i
        const positiveScheduling = /\b(?:can|may|could|will|should)\b[^.!?;]{0,100}\bbe\s+scheduled\b|\bis(?:\s*,[^,]{1,80},)?\s+scheduled\b[^.!?;]{0,80}\bas\s+(?:an?\s+)?(?:hands-on\s+)?lab\b/i
        if (positiveClaim.test(withoutNegations) || positiveScheduling.test(withoutNegations)) {
          throw new Error(
            `${section.id} status contradiction in ${path}: deferred but claimed authored/runnable/schedulable`,
          )
        }
      }
    }
  }
  const matrix = documents.get('docs/validation-matrix.md') ?? ''
  for (const section of deferred) {
    const row = matrix.split('\n').find((line) => line.includes(section.id) && line.startsWith('|'))
    if (!row?.includes('`deferred`'))
      throw new Error(`docs/validation-matrix.md must mark ${section.id} as deferred`)
  }
  return true
}

export function validateDocumentationTruth(manifest = sections, { repoRoot = resolve(import.meta.dirname, '..') } = {}) {
  validateManifest(manifest, { repoRoot })
  for (const section of manifest) {
    validateSectionFrontmatter(
      section,
      readFileSync(resolve(repoRoot, sectionPath(section)), 'utf8'),
    )
  }
  const paths = ['README.md', 'docs/syllabus.md', 'docs/facilitator-guide.md', 'labs/README.md', 'docs/validation-matrix.md']
  const documents = new Map(paths.map((path) => [path, readFileSync(resolve(repoRoot, path), 'utf8')]))
  const syllabus = documents.get('docs/syllabus.md')
  validateSyllabusCatalog(manifest, syllabus)
  validateSyllabusTimings(manifest, syllabus)
  validateCanonicalScheduleTables(manifest, syllabus)
  validateFrontDoorFacts(manifest, documents)
  validateStatusClaims(manifest, documents)
  for (const markdown of documents.values())
    validatePlanningLanguage(markdown, manifest)
  return true
}

export function renderDeck(selected, { title, description, generated = true } = {}) {
  const marker = generated
    ? '<!-- Generated by scripts/generate-decks.mjs from scripts/deck-manifest.mjs. Do not edit. -->\n'
    : ''
  const imports = selected.map((section) => `---\n# ${section.id} · ${section.title} · ${section.tier} · Day ${section.day} · ${section.status}\nsrc: ${sectionPath(section)}\n---`).join('\n\n')
  const deferred = selected.filter((section) => section.status === 'deferred').map((section) => section.id)
  if (deferred.length && /\b(?:all|every|fully)\b[^.]{0,40}\bauthored\b/i.test(description))
    throw new Error('Deck description contradiction: deferred selection says fully authored')
  if (!deferred.length && /\b(?:deferred|stub)\b/i.test(description))
    throw new Error('Deck description contradiction: authored selection says deferred')
  const statusNotice = deferred.length
    ? `\n> **Status:** ${deferred.join(', ')} ${deferred.length === 1 ? 'is' : 'are'} deferred and not schedulable.\n`
    : '\n> **Status:** All selected sections are authored.\n'
  return `---\ntheme: ./theme\ntitle: Kubernetes Practitioner Workshop — ${title}\ninfo: |\n  Open source, vendor-neutral Kubernetes workshop.\n  ${description}. Sections are imported from the shared section library.\nlayout: cover\n---\n${marker}\n# Kubernetes Practitioner Workshop\n\n${title} — ${description}.\n${statusNotice}\n${imports}\n`
}

export function renderGeneratedDecks(manifest = sections) {
  return new Map(generatedDecks.map((deck) => [
    deck.file,
    renderDeck(manifest.filter(deck.select), deck),
  ]))
}

export function findGeneratedDrift(expected, { repoRoot = resolve(import.meta.dirname, '..') } = {}) {
  return [...expected].flatMap(([file, content]) => {
    const path = resolve(repoRoot, file)
    return !existsSync(path) || readFileSync(path, 'utf8') !== content ? [file] : []
  })
}

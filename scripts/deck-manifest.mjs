import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const sections = [
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

export const generatedDecks = [
  { file: 'slides-day-1.md', title: 'Day 1', description: 'Foundations and the core red line', select: (s) => s.day === 1 && s.canonical },
  { file: 'slides-day-2.md', title: 'Day 2', description: 'Modern routing and running workloads well', select: (s) => s.day === 2 && s.canonical },
  { file: 'slides-day-3.md', title: 'Day 3', description: 'Security, delivery, operators, and best practices', select: (s) => s.day === 3 && s.canonical },
  { file: 'slides-optional.md', title: 'Optional / Appendix', description: 'On-ramp, add-backs, and advanced sections', select: (s) => !s.canonical },
  { file: 'slides-3day.md', title: '3-day compatibility cut', description: 'The three canonical days in one compatibility deck', select: (s) => s.canonical },
  { file: 'slides.md', title: 'Content superset', description: 'Compatibility deck containing every authored section', select: () => true },
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
      || !['authored', 'deferred'].includes(section.status)) {
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

export function validatePlanningLanguage(markdown) {
  const measuredNumber = /\b(?:measured|actual)\s+(?:time|timing|total)?\s*:?\s*~?\d+\s*min/i
  if (measuredNumber.test(markdown))
    throw new Error('An unrehearsed planning estimate is presented as measured timing')
  for (const line of markdown.split('\n')) {
    if (/\bDay [123]\b.*\b(?:365|345|420)\s*min\b/i.test(line)
      && !/\b(?:planned|planning|estimate|target|unrehearsed)\b/i.test(line)) {
      const value = line.match(/(?:365|345|420)/)?.[0]
      throw new Error(`${value} min day total must be labelled planned or estimated`)
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
  validateStatusClaims(manifest, documents)
  for (const markdown of documents.values())
    validatePlanningLanguage(markdown)
  return true
}

export function renderDeck(selected, { title, description, generated = true } = {}) {
  const marker = generated
    ? '<!-- Generated by scripts/generate-decks.mjs from scripts/deck-manifest.mjs. Do not edit. -->\n'
    : ''
  const imports = selected.map((section) => `---\n# ${section.id} · ${section.title} · ${section.tier} · Day ${section.day} · ${section.status}\nsrc: ${sectionPath(section)}\n---`).join('\n\n')
  return `---\ntheme: ./theme\ntitle: Kubernetes Practitioner Workshop — ${title}\ninfo: |\n  Open source, vendor-neutral Kubernetes workshop.\n  ${description}. Sections are imported from the shared section library.\nlayout: cover\n---\n${marker}\n# Kubernetes Practitioner Workshop\n\n${title} — ${description}.\n\n${imports}\n`
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

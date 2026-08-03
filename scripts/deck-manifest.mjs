import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const sections = [
  { id: 'S00', slug: 'welcome', title: 'Welcome & setup', tier: 'core', day: 1, canonical: true },
  { id: 'S01', slug: 'containers', title: 'Containers', tier: 'recommended', day: 1, canonical: false },
  { id: 'S02', slug: 'container-security', title: 'Container security & supply chain', tier: 'recommended', day: 1, canonical: false },
  { id: 'S03', slug: 'mental-model', title: 'Kubernetes mental model', tier: 'core', day: 1, canonical: true },
  { id: 'S04', slug: 'kubectl', title: 'kubectl', tier: 'core', day: 1, canonical: true },
  { id: 'S05', slug: 'pod', title: 'Pod', tier: 'core', day: 1, canonical: true },
  { id: 'S06', slug: 'deployment', title: 'Deployment', tier: 'core', day: 1, canonical: true },
  { id: 'S07', slug: 'service', title: 'Service', tier: 'core', day: 1, canonical: true },
  { id: 'S08', slug: 'ingress', title: 'Ingress', tier: 'core', day: 1, canonical: true },
  { id: 'S09', slug: 'gateway-api', title: 'Gateway API', tier: 'recommended', day: 2, canonical: true },
  { id: 'S10', slug: 'config', title: 'ConfigMap & Secret', tier: 'core', day: 2, canonical: true },
  { id: 'S11', slug: 'storage', title: 'Storage (PV/PVC/StorageClass)', tier: 'core', day: 2, canonical: true },
  { id: 'S12', slug: 'statefulset', title: 'StatefulSet', tier: 'recommended', day: 2, canonical: true },
  { id: 'S13', slug: 'resources', title: 'Resources & limits', tier: 'core', day: 2, canonical: true },
  { id: 'S14', slug: 'probes', title: 'Health probes', tier: 'core', day: 2, canonical: true },
  { id: 'S15', slug: 'jobs', title: 'Jobs & CronJobs', tier: 'recommended', day: 2, canonical: false },
  { id: 'S16', slug: 'hpa', title: 'Autoscaling (HPA)', tier: 'optional', day: 2, canonical: false },
  { id: 'S17', slug: 'pod-security', title: 'Pod security', tier: 'core', day: 3, canonical: true },
  { id: 'S18', slug: 'networkpolicy', title: 'NetworkPolicy', tier: 'recommended', day: 3, canonical: false },
  { id: 'S19', slug: 'rbac', title: 'RBAC', tier: 'optional', day: 3, canonical: false },
  { id: 'S20', slug: 'helm', title: 'Helm', tier: 'core', day: 3, canonical: true },
  { id: 'S21', slug: 'gitops', title: 'GitOps with Argo CD', tier: 'recommended', day: 3, canonical: true },
  { id: 'S22', slug: 'operator-pattern', title: 'The operator pattern', tier: 'recommended', day: 3, canonical: true },
  { id: 'S23', slug: 'prometheus-operator', title: 'Prometheus Operator', tier: 'recommended', day: 3, canonical: true },
  { id: 'S24', slug: 'kubebuilder', title: 'Operator dev 101 (kubebuilder)', tier: 'optional', day: 3, canonical: false },
  { id: 'S25', slug: 'pod-escape', title: 'Security & pod escape', tier: 'recommended', day: 3, canonical: true },
  { id: 'S26', slug: 'best-practices', title: 'Best practices', tier: 'core', day: 3, canonical: true },
  { id: 'S27', slug: 'wrap-up', title: 'Wrap-up & next steps', tier: 'core', day: 3, canonical: true },
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
      || !['core', 'recommended', 'optional'].includes(section.tier)) {
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

export function renderDeck(selected, { title, description, generated = true } = {}) {
  const marker = generated
    ? '<!-- Generated by scripts/generate-decks.mjs from scripts/deck-manifest.mjs. Do not edit. -->\n'
    : ''
  const imports = selected.map((section) => `---\n# ${section.id} · ${section.title} · ${section.tier} · Day ${section.day}\nsrc: ${sectionPath(section)}\n---`).join('\n\n')
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

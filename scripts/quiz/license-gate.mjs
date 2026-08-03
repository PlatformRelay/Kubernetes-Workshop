import { readFileSync } from 'node:fs'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

const evidencePath = path.resolve(process.argv[2] ?? '')
if (!evidencePath) throw new Error('usage: license-gate.mjs EVIDENCE.json')
const report = JSON.parse(readFileSync(evidencePath, 'utf8'))
const forbidden = /BUSL|BSL|SSPL|Commons Clause|source-available|proprietary|all rights reserved|unknown|unlicensed/i
const allowedLicenses = new Set([
  '0BSD', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'Apache-1.1', 'Apache-2.0', 'Artistic-1.0',
  'Artistic-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'EPL-1.0', 'EPL-2.0',
  'GPL-1.0-only', 'GPL-1.0-or-later', 'GPL-2.0-only', 'GPL-2.0-or-later', 'GPL-3.0-only',
  'GPL-3.0-or-later', 'ISC', 'LGPL-2.0-only', 'LGPL-2.0-or-later', 'LGPL-2.1-only',
  'LGPL-2.1-or-later', 'LGPL-3.0-only', 'LGPL-3.0-or-later', 'MIT', 'MPL-1.1', 'MPL-2.0',
  'OpenSSL', 'PostgreSQL', 'Python-2.0', 'Unicode-3.0', 'Unlicense', 'Zlib',
])
const exactCommit = /^[0-9a-f]{40}$/
const immutableImage = /^\S+@sha256:[0-9a-f]{64}$/
const evidenceErrors = []
const evidenceDirectory = path.dirname(evidencePath)

function readSbom(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.endsWith('.cdx.json.gz')) return null
  const resolved = path.resolve(evidenceDirectory, relativePath)
  if (!resolved.startsWith(`${evidenceDirectory}${path.sep}`)) return null
  try {
    return JSON.parse(gunzipSync(readFileSync(resolved), { encoding: 'utf8' }))
  }
  catch {
    return null
  }
}

function sbomLicensesAreComplete(sbom) {
  return Array.isArray(sbom?.components) && sbom.components.length > 0 && sbom.components.every(component =>
    Array.isArray(component.licenses) && component.licenses.length > 0 && component.licenses.every(entry => {
      const license = entry.license?.id ?? entry.license?.name
      return typeof license === 'string' && !forbidden.test(license) && allowedLicenses.has(license)
    }),
  )
}

if (!Array.isArray(report.candidates) || report.candidates.length === 0) {
  evidenceErrors.push('candidates must be a non-empty array')
}

for (const candidate of report.candidates ?? []) {
  if (typeof candidate.fossGate?.passed !== 'boolean') {
    evidenceErrors.push(`${candidate.id}: fossGate.passed must be a boolean`)
    continue
  }
  if (!Array.isArray(candidate.runtimeComponents) || candidate.runtimeComponents.length === 0) {
    evidenceErrors.push(`${candidate.id}: runtimeComponents must be a non-empty array`)
    continue
  }
  const runtimeIsFoss = candidate.runtimeComponents.every(component =>
    allowedLicenses.has(component.license) && exactCommit.test(component.sourceCommit) && immutableImage.test(component.imageDigest),
  )
  const sbomEvidence = Array.isArray(candidate.sbomEvidence) ? candidate.sbomEvidence : []
  const inspected = sbomEvidence.map(reference => ({ reference, sbom: readSbom(reference.path) }))
  const sourceEvidence = inspected.find(({ reference, sbom }) =>
    reference.kind === 'source'
      && reference.identity === candidate.sourceCommit
      && sbom?.metadata?.component?.properties?.some(property =>
        property.name === 'workshop:sourceCommit' && property.value === candidate.sourceCommit,
      ),
  )
  const imageEvidenceIsComplete = candidate.runtimeComponents.every(component => inspected.some(({ reference, sbom }) =>
    reference.kind === 'image'
      && reference.runtimeComponent === component.name
      && reference.identity === component.imageDigest
      && sbom?.metadata?.component?.name === component.imageDigest
      && sbomLicensesAreComplete(sbom),
  ))
  const sbomEvidenceIsComplete = Boolean(sourceEvidence)
    && sbomLicensesAreComplete(sourceEvidence.sbom)
    && imageEvidenceIsComplete
  const computedPass = runtimeIsFoss && sbomEvidenceIsComplete
  if (candidate.fossGate?.passed && !sbomEvidenceIsComplete) {
    evidenceErrors.push(`${candidate.id}: SBOM evidence is incomplete or contains unknown/non-FOSS licenses`)
  }
  if (computedPass !== candidate.fossGate.passed) {
    evidenceErrors.push(`${candidate.id}: recorded FOSS verdict does not match fail-closed evidence`)
  }
}

if (evidenceErrors.length) {
  process.stderr.write(`${evidenceErrors.join('\n')}\n`)
  process.exit(1)
}

const passed = report.candidates.filter(candidate => candidate.fossGate.passed).length
process.stdout.write(`${passed} of ${report.candidates.length} candidates passed the complete-runtime FOSS gate.\n`)

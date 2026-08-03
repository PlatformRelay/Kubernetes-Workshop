import { lstatSync, readFileSync, realpathSync } from 'node:fs'
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
const evidenceRoot = realpathSync(evidenceDirectory)

function isInside(root, target) {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

function pathContainsSymlink(root, target) {
  const relative = path.relative(root, target)
  let current = root
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment)
    if (lstatSync(current).isSymbolicLink()) return true
  }
  return false
}

function readSbom(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.endsWith('.cdx.json.gz')) {
    return { error: 'path must name a .cdx.json.gz file' }
  }
  const resolved = path.resolve(evidenceDirectory, relativePath)
  if (!isInside(evidenceDirectory, resolved)) return { error: 'path escapes the evidence root' }
  try {
    if (pathContainsSymlink(evidenceDirectory, resolved)) return { error: 'symlinks are not allowed' }
    const real = realpathSync(resolved)
    if (!isInside(evidenceRoot, real)) return { error: 'resolved path escapes the evidence root' }
    if (!lstatSync(real).isFile()) return { error: 'evidence target must be a regular file' }
    return { sbom: JSON.parse(gunzipSync(readFileSync(real), { encoding: 'utf8' })) }
  }
  catch {
    return { error: 'cannot be read as gzip CycloneDX JSON' }
  }
}

function imageSourceCommit(sbom) {
  const revision = sbom.metadata?.component?.properties?.find(property =>
    property.name === 'aquasecurity:trivy:Labels:org.opencontainers.image.revision'
  )?.value
  return exactCommit.test(revision ?? '') ? revision : 'unknown'
}

function missingLicenseCount(sbom) {
  return sbom.components.filter(component => !Array.isArray(component.licenses) || component.licenses.length === 0).length
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
  if (!candidate.runtimeComponents.some(component => component.name === candidate.applicationComponent)) {
    evidenceErrors.push(`${candidate.id}: applicationComponent must name one runtime component`)
    continue
  }
  const runtimeIsFoss = candidate.runtimeComponents.every(component =>
    allowedLicenses.has(component.license) && exactCommit.test(component.sourceCommit) && immutableImage.test(component.imageDigest),
  )
  const sbomEvidence = Array.isArray(candidate.sbomEvidence) ? candidate.sbomEvidence : []
  const sourceReferences = sbomEvidence.filter(reference => reference.kind === 'source')
  const imageReferences = sbomEvidence.filter(reference => reference.kind === 'image')
  const candidateEvidenceErrors = []
  if (sourceReferences.length !== 1
    || !imageReferences.some(reference =>
      reference.role === 'application' && reference.runtimeComponent === candidate.applicationComponent
    )) {
    candidateEvidenceErrors.push(`${candidate.id}: sbomEvidence must include exactly one source and at least one image`)
  }
  const inspected = sbomEvidence.map(reference => ({ reference, ...readSbom(reference.path) }))
  for (const { reference, sbom, error } of inspected) {
    const label = `${candidate.id}/${reference.path ?? '<missing path>'}`
    if (!['source', 'image'].includes(reference.kind)) {
      candidateEvidenceErrors.push(`${label}: kind must be source or image`)
      continue
    }
    if (error) {
      candidateEvidenceErrors.push(`${label}: ${error}`)
      continue
    }
    if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
      candidateEvidenceErrors.push(`${label}: SBOM components must be a non-empty array`)
      continue
    }
    if (reference.componentCount !== sbom.components.length) {
      candidateEvidenceErrors.push(`${label}: componentCount does not match SBOM contents`)
    }
    if (reference.missingLicenseCount !== missingLicenseCount(sbom)) {
      candidateEvidenceErrors.push(`${label}: missingLicenseCount does not match SBOM contents`)
    }
    if (reference.kind === 'source') {
      const sbomSourceCommit = sbom.metadata?.component?.properties?.find(property =>
        property.name === 'workshop:sourceCommit'
      )?.value
      if (reference.identity !== candidate.sourceCommit || sbomSourceCommit !== candidate.sourceCommit) {
        candidateEvidenceErrors.push(`${candidate.id}: source SBOM identity does not match candidate sourceCommit`)
      }
      continue
    }
    const runtimeComponent = candidate.runtimeComponents.find(component => component.name === reference.runtimeComponent)
    if (!runtimeComponent
      || reference.identity !== runtimeComponent.imageDigest
      || sbom.metadata?.component?.name !== runtimeComponent.imageDigest) {
      candidateEvidenceErrors.push(`${label}: image SBOM identity does not match its runtime component digest`)
      continue
    }
    if (!['application', 'runtime'].includes(reference.role)) {
      candidateEvidenceErrors.push(`${label}: image role must be application or runtime`)
      continue
    }
    const expectedRole = reference.runtimeComponent === candidate.applicationComponent ? 'application' : 'runtime'
    if (reference.role !== expectedRole) {
      candidateEvidenceErrors.push(`${label}: image role does not match candidate applicationComponent`)
      continue
    }
    const discoveredSourceCommit = imageSourceCommit(sbom)
    const expectedStatus = discoveredSourceCommit === 'unknown'
      ? 'unknown'
      : discoveredSourceCommit === runtimeComponent.sourceCommit
        && (expectedRole !== 'application' || discoveredSourceCommit === candidate.sourceCommit)
        ? 'match'
        : 'mismatch'
    if (reference.sourceCommit !== discoveredSourceCommit || reference.sourceCommitStatus !== expectedStatus) {
      candidateEvidenceErrors.push(`${label}: recorded image source provenance does not match SBOM revision`)
    }
  }
  if (candidateEvidenceErrors.length > 0) {
    evidenceErrors.push(...candidateEvidenceErrors)
    continue
  }
  const sourceEvidence = inspected.find(({ reference }) => reference.kind === 'source')
  const imageEvidenceIsComplete = candidate.runtimeComponents.every(component => inspected.some(({ reference, sbom }) =>
    reference.kind === 'image'
      && reference.runtimeComponent === component.name
      && reference.identity === component.imageDigest
      && sbom?.metadata?.component?.name === component.imageDigest
      && reference.sourceCommitStatus === 'match'
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

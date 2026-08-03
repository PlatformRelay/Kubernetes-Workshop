import { readFileSync } from 'node:fs'
import path from 'node:path'

const evidencePath = path.resolve(process.argv[2] ?? '')
if (!evidencePath) throw new Error('usage: license-gate.mjs EVIDENCE.json')
const report = JSON.parse(readFileSync(evidencePath, 'utf8'))
const forbidden = /BUSL|BSL|SSPL|Commons Clause|source-available|proprietary|all rights reserved|unknown|unlicensed/i
const allowedLicenses = new Set(['AGPL-3.0-only', 'MPL-2.0', 'MIT', 'PostgreSQL', 'BSD-3-Clause'])
const exactCommit = /^[0-9a-f]{40}$/
const immutableImage = /^\S+@sha256:[0-9a-f]{64}$/
const evidenceErrors = []

for (const candidate of report.candidates ?? []) {
  for (const component of candidate.runtimeComponents ?? []) {
    if (candidate.fossGate.passed && (forbidden.test(component.license ?? 'unknown') || !allowedLicenses.has(component.license))) {
      evidenceErrors.push(`${candidate.id}/${component.name}: forbidden or unknown license ${component.license ?? 'unknown'}`)
    }
  }
  const computedPass = candidate.runtimeComponents?.every(component =>
    allowedLicenses.has(component.license) && exactCommit.test(component.sourceCommit) && immutableImage.test(component.imageDigest),
  ) && candidate.dependencyLicenseCoverage === 'complete'
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

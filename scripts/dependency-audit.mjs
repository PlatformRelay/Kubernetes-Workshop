#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const BLOCKED_SEVERITIES = new Set(['high', 'critical'])

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

export function parseAuditOutput(stdout, status = 0) {
  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    return { report: null, error: 'Dependency scanner unavailable or returned invalid JSON.' }
  }
  if (status !== 0 && status !== 1) {
    return { report: null, error: `Dependency scanner failed with unexpected exit status ${status}.` }
  }
  if (
    !report
    || report.error
    || typeof report.advisories !== 'object'
    || typeof report.metadata?.vulnerabilities !== 'object'
  ) {
    return { report: null, error: 'Dependency scanner unavailable: response is not an audit report.' }
  }
  const advisoryCounts = { high: 0, critical: 0 }
  for (const advisory of Object.values(report.advisories)) {
    if (advisory.severity in advisoryCounts) advisoryCounts[advisory.severity] += 1
  }
  for (const severity of BLOCKED_SEVERITIES) {
    if ((report.metadata.vulnerabilities[severity] ?? 0) !== advisoryCounts[severity]) {
      return { report: null, error: `Dependency scanner returned inconsistent ${severity} vulnerability metadata.` }
    }
  }
  return { report, error: null }
}

export function evaluateAudit(report, policy, today = new Date().toISOString().slice(0, 10)) {
  const errors = []
  const validExceptions = new Map()
  for (const exception of policy.exceptions ?? []) {
    if (!exception.id || !exception.reason || !exception.owner) {
      errors.push(`Exception ${exception.id ?? '<missing id>'} requires reason and owner`)
      continue
    }
    if (!isIsoDate(exception.expires)) {
      errors.push(`Exception ${exception.id} requires an ISO expiry date`)
      continue
    }
    if (exception.expires < today) {
      errors.push(`Exception ${exception.id} expired on ${exception.expires}`)
      continue
    }
    validExceptions.set(exception.id, exception)
  }

  for (const advisory of Object.values(report.advisories ?? {})) {
    if (!BLOCKED_SEVERITIES.has(advisory.severity)) continue
    const id = advisory.github_advisory_id ?? String(advisory.id ?? 'unknown-advisory')
    if (!validExceptions.has(id)) {
      errors.push(`${id}: ${advisory.module_name} (${advisory.severity}) — ${advisory.title}`)
    }
  }

  return {
    ok: errors.length === 0,
    message: errors.length === 0
      ? 'Locked dependency audit passed: no unexcepted high or critical advisories.'
      : errors.join('\n'),
  }
}

function compareVersions(left, right) {
  const parse = (value) => {
    const match = String(value).match(/^(\d+)\.(\d+)\.(\d+)$/)
    return match ? match.slice(1).map(Number) : null
  }
  const leftParts = parse(left)
  const rightParts = parse(right)
  if (!leftParts || !rightParts) return null
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return Math.sign(leftParts[index] - rightParts[index])
  }
  return 0
}

function isVersionInRange(version, range) {
  const comparators = String(range).split(',').map((part) => part.trim()).filter(Boolean)
  if (comparators.length === 0) return null
  for (const comparator of comparators) {
    const match = comparator.match(/^(<=|>=|<|>|=)\s*(\d+\.\d+\.\d+)$/)
    if (!match) return null
    const comparison = compareVersions(version, match[2])
    if (comparison === null) return null
    const matches = {
      '<': comparison < 0,
      '<=': comparison <= 0,
      '=': comparison === 0,
      '>=': comparison >= 0,
      '>': comparison > 0,
    }[match[1]]
    if (!matches) return false
  }
  return true
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function evaluateLockedAdvisories(lockfileContents, evidence) {
  let lockfile
  try {
    lockfile = parseYaml(lockfileContents)
  } catch (error) {
    return { ok: false, message: `Cannot parse pnpm-lock.yaml: ${error.message}` }
  }
  if (!lockfile?.packages || typeof lockfile.packages !== 'object') {
    return { ok: false, message: 'pnpm-lock.yaml does not contain a packages map.' }
  }
  if (
    !isIsoDate(evidence?.captured)
    || evidence?.source !== 'GitHub Global Security Advisory API'
    || !Array.isArray(evidence?.advisories)
    || evidence.advisories.length === 0
  ) {
    return { ok: false, message: 'Checked-in advisory evidence requires a capture date, GitHub API source, and at least one advisory.' }
  }

  const errors = []
  for (const advisory of evidence?.advisories ?? []) {
    if (
      !/^GHSA-[0-9a-z-]+$/.test(advisory.id ?? '')
      || !advisory.package
      || advisory.ecosystem !== 'npm'
      || !BLOCKED_SEVERITIES.has(advisory.severity)
      || !advisory.vulnerableVersionRange
      || !advisory.firstPatchedVersion
      || advisory.source !== `https://github.com/advisories/${advisory.id}`
    ) {
      errors.push(`${advisory.id ?? '<missing id>'}: malformed checked-in advisory evidence`)
      continue
    }
    if (isVersionInRange(advisory.firstPatchedVersion, advisory.vulnerableVersionRange) !== false) {
      errors.push(`${advisory.id}: first patched version ${advisory.firstPatchedVersion} contradicts its vulnerable range`)
      continue
    }
    const packageKey = new RegExp(`^${escapeRegex(advisory.package)}@([^()]+)`)
    for (const key of Object.keys(lockfile.packages)) {
      const version = key.match(packageKey)?.[1]
      if (!version) continue
      const vulnerable = isVersionInRange(version, advisory.vulnerableVersionRange)
      if (vulnerable === null) {
        errors.push(`${advisory.id}: cannot compare ${advisory.package}@${version} with ${advisory.vulnerableVersionRange}`)
      } else if (vulnerable) {
        errors.push(`${advisory.id}: ${advisory.package}@${version} is inside vulnerable range ${advisory.vulnerableVersionRange}; first patched version is ${advisory.firstPatchedVersion}`)
      }
    }
  }

  return {
    ok: errors.length === 0,
    message: errors.length === 0
      ? 'Locked advisory evidence passed: no package version is inside a recorded vulnerable range.'
      : errors.join('\n'),
  }
}

async function main() {
  const root = process.cwd()
  const policyFile = path.join(root, 'supply-chain', 'dependency-audit.json')
  const evidenceFile = path.join(root, 'supply-chain', 'dependency-advisories.json')
  const lockfilePath = path.join(root, 'pnpm-lock.yaml')
  let policy
  let evidence
  let lockfile
  try {
    [policy, evidence, lockfile] = await Promise.all([
      readFile(policyFile, 'utf8').then(JSON.parse),
      readFile(evidenceFile, 'utf8').then(JSON.parse),
      readFile(lockfilePath, 'utf8'),
    ])
  } catch (error) {
    console.error(`Cannot read dependency audit policy inputs: ${error.message}`)
    process.exitCode = 2
    return
  }

  const lockedResult = evaluateLockedAdvisories(lockfile, evidence)
  if (!lockedResult.ok) {
    console.error(lockedResult.message)
    process.exitCode = 1
    return
  }
  console.log(lockedResult.message)

  const audit = spawnSync('pnpm', ['audit', '--audit-level', 'high', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  const parsed = parseAuditOutput(audit.stdout, audit.status)
  if (!parsed.report) {
    console.error(`${parsed.error} (exit ${audit.status ?? 'unknown'}).`)
    if (audit.stderr) console.error(audit.stderr.trim())
    process.exitCode = 2
    return
  }
  const report = parsed.report

  const result = evaluateAudit(report, policy)
  const metadata = report.metadata?.vulnerabilities ?? {}
  console.log(`Audit counts: critical=${metadata.critical ?? 0}, high=${metadata.high ?? 0}, moderate=${metadata.moderate ?? 0}, low=${metadata.low ?? 0}`)
  if (!result.ok) {
    console.error(result.message)
    process.exitCode = 1
    return
  }
  console.log(result.message)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}

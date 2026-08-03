#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const BLOCKED_SEVERITIES = new Set(['high', 'critical'])

export function parseAuditOutput(stdout) {
  let report
  try {
    report = JSON.parse(stdout)
  } catch {
    return { report: null, error: 'Dependency scanner unavailable or returned invalid JSON.' }
  }
  if (
    !report
    || typeof report.advisories !== 'object'
    || typeof report.metadata?.vulnerabilities !== 'object'
  ) {
    return { report: null, error: 'Dependency scanner unavailable: response is not an audit report.' }
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires ?? '')) {
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

async function main() {
  const root = process.cwd()
  const policyFile = path.join(root, 'supply-chain', 'dependency-audit.json')
  let policy
  try {
    policy = JSON.parse(await readFile(policyFile, 'utf8'))
  } catch (error) {
    console.error(`Cannot read dependency audit policy: ${error.message}`)
    process.exitCode = 2
    return
  }

  const audit = spawnSync('pnpm', ['audit', '--audit-level', 'high', '--json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  })
  const parsed = parseAuditOutput(audit.stdout)
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

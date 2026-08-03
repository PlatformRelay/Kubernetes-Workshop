import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

import { evaluateAudit, evaluateLockedAdvisories, parseAuditOutput } from './dependency-audit.mjs'

const highAdvisory = {
  advisories: {
    '123': {
      github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
      module_name: 'example',
      severity: 'high',
      title: 'Example vulnerability',
    },
  },
  metadata: { vulnerabilities: { high: 1 } },
}

test('fails a high-severity advisory without an exception', () => {
  const result = evaluateAudit(highAdvisory, { exceptions: [] }, '2026-08-03')

  assert.equal(result.ok, false)
  assert.match(result.message, /GHSA-aaaa-bbbb-cccc/)
})

test('accepts a documented unexpired advisory exception', () => {
  const result = evaluateAudit(highAdvisory, {
    exceptions: [{
      id: 'GHSA-aaaa-bbbb-cccc',
      reason: 'No reachable vulnerable path in the static deck build.',
      owner: 'maintainers',
      expires: '2026-08-31',
    }],
  }, '2026-08-03')

  assert.equal(result.ok, true)
})

test('fails an expired advisory exception', () => {
  const result = evaluateAudit(highAdvisory, {
    exceptions: [{
      id: 'GHSA-aaaa-bbbb-cccc',
      reason: 'Temporary exception.',
      owner: 'maintainers',
      expires: '2026-08-02',
    }],
  }, '2026-08-03')

  assert.equal(result.ok, false)
  assert.match(result.message, /expired/)
})

test('fails an impossible calendar date in an advisory exception', () => {
  const result = evaluateAudit(highAdvisory, {
    exceptions: [{
      id: 'GHSA-aaaa-bbbb-cccc',
      reason: 'Mutation fixture.',
      owner: 'maintainers',
      expires: '2026-99-99',
    }],
  }, '2026-08-03')

  assert.equal(result.ok, false)
  assert.match(result.message, /ISO expiry date/)
})

test('fails malformed exceptions instead of silently waiving advisories', () => {
  const result = evaluateAudit(highAdvisory, {
    exceptions: [{ id: 'GHSA-aaaa-bbbb-cccc', expires: '2999-01-01' }],
  }, '2026-08-03')

  assert.equal(result.ok, false)
  assert.match(result.message, /reason and owner/)
})

test('passes when only vulnerabilities below high severity exist', () => {
  const result = evaluateAudit({
    advisories: {
      '456': {
        github_advisory_id: 'GHSA-dddd-eeee-ffff',
        module_name: 'example',
        severity: 'moderate',
        title: 'Moderate vulnerability',
      },
    },
  }, { exceptions: [] }, '2026-08-03')

  assert.equal(result.ok, true)
})

test('distinguishes a structured registry error from a clean audit', () => {
  const parsed = parseAuditOutput('{"error":"registry unavailable"}', 1)

  assert.equal(parsed.report, null)
  assert.match(parsed.error, /scanner unavailable/)
})

test('rejects an unexpected scanner exit status even with audit-shaped JSON', () => {
  const parsed = parseAuditOutput(JSON.stringify(highAdvisory), 2)

  assert.equal(parsed.report, null)
  assert.match(parsed.error, /exit status/)
})

test('rejects vulnerability metadata that disagrees with advisory records', () => {
  const parsed = parseAuditOutput(JSON.stringify({
    advisories: {},
    metadata: { vulnerabilities: { high: 1, critical: 0, moderate: 0, low: 0, info: 0 } },
  }), 1)

  assert.equal(parsed.report, null)
  assert.match(parsed.error, /inconsistent/)
})

const advisoryEvidence = {
  captured: '2026-08-04',
  source: 'GitHub Global Security Advisory API',
  advisories: [
    {
      id: 'GHSA-r28c-9q8g-f849',
      package: 'postcss',
      ecosystem: 'npm',
      severity: 'high',
      vulnerableVersionRange: '<= 8.5.17',
      firstPatchedVersion: '8.5.18',
      source: 'https://github.com/advisories/GHSA-r28c-9q8g-f849',
    },
    {
      id: 'GHSA-pm4m-ph32-ghv5',
      package: 'js-yaml',
      ecosystem: 'npm',
      severity: 'high',
      vulnerableVersionRange: '>= 5.0.0, <= 5.2.1',
      firstPatchedVersion: '5.2.2',
      source: 'https://github.com/advisories/GHSA-pm4m-ph32-ghv5',
    },
  ],
}

test('fails closed when checked-in advisory evidence is empty or malformed', () => {
  for (const evidence of [
    { captured: '2026-08-04', source: 'GitHub Global Security Advisory API', advisories: [] },
    { ...advisoryEvidence, captured: 'not-a-date' },
  ]) {
    const result = evaluateLockedAdvisories('packages: {}\n', evidence)
    assert.equal(result.ok, false)
    assert.match(result.message, /advisory evidence/i)
  }
})

test('fails lock entries inside recorded GitHub advisory ranges', () => {
  const result = evaluateLockedAdvisories(`
packages:
  postcss@8.5.16: {}
  js-yaml@5.2.0: {}
`, advisoryEvidence)

  assert.equal(result.ok, false)
  assert.match(result.message, /GHSA-r28c-9q8g-f849: postcss@8\.5\.16/)
  assert.match(result.message, /GHSA-pm4m-ph32-ghv5: js-yaml@5\.2\.0/)
})

test('accepts lock entries at or above recorded patched versions', () => {
  const result = evaluateLockedAdvisories(`
packages:
  postcss@8.5.18: {}
  js-yaml@4.3.0: {}
  js-yaml@5.2.2: {}
`, advisoryEvidence)

  assert.deepEqual(result, {
    ok: true,
    message: 'Locked advisory evidence passed: no package version is inside a recorded vulnerable range.',
  })
})

test('repository lock satisfies the checked-in GitHub advisory evidence', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const [lockfile, evidence] = await Promise.all([
    readFile(path.join(root, 'pnpm-lock.yaml'), 'utf8'),
    readFile(path.join(root, 'supply-chain/dependency-advisories.json'), 'utf8').then(JSON.parse),
  ])

  const result = evaluateLockedAdvisories(lockfile, evidence)

  assert.equal(result.ok, true, result.message)
})

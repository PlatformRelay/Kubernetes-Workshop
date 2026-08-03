import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAudit, parseAuditOutput } from './dependency-audit.mjs'

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

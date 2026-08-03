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
  const parsed = parseAuditOutput('{"error":"registry unavailable"}')

  assert.equal(parsed.report, null)
  assert.match(parsed.error, /scanner unavailable/)
})

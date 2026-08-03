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

test('rejects noncanonical advisory IDs and invalid npm package names', () => {
  const valid = advisoryEvidence.advisories[0]
  for (const advisory of [
    { ...valid, id: 'GHSA-aaaa-bbbb-cccc', source: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc' },
    { ...valid, id: 'GHSA-r28c-9q8g', source: 'https://github.com/advisories/GHSA-r28c-9q8g' },
    { ...valid, package: '   ' },
    { ...valid, package: 'bad package' },
    { ...valid, package: '@missing-slash' },
  ]) {
    const result = evaluateLockedAdvisories('packages: {}\n', {
      ...advisoryEvidence,
      advisories: [advisory],
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /malformed checked-in advisory evidence/)
  }
})

test('accepts valid scoped dot and underscore leaves and enforces UTF-8 byte limits', () => {
  const valid = advisoryEvidence.advisories[0]
  for (const packageName of ['@scope/.pkg', '@scope/_pkg', 'a'.repeat(214)]) {
    const result = evaluateLockedAdvisories('packages: {}\n', {
      ...advisoryEvidence,
      advisories: [{ ...valid, package: packageName }],
    })
    assert.equal(result.ok, true, `${packageName}: ${result.message}`)
  }

  const result = evaluateLockedAdvisories('packages: {}\n', {
    ...advisoryEvidence,
    advisories: [{ ...valid, package: 'a'.repeat(215) }],
  })
  assert.equal(result.ok, false)
  assert.match(result.message, /malformed checked-in advisory evidence/)
})

test('validates every range comparator before evaluating versions', () => {
  const valid = advisoryEvidence.advisories[0]
  const result = evaluateLockedAdvisories('packages: {}\n', {
    ...advisoryEvidence,
    advisories: [{
      ...valid,
      vulnerableVersionRange: '> 999.0.0, NOT-A-RANGE',
    }],
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /malformed checked-in advisory evidence/)
})

test('rejects empty comparator segments', () => {
  const valid = advisoryEvidence.advisories[1]
  const result = evaluateLockedAdvisories('packages: {}\n', {
    ...advisoryEvidence,
    advisories: [{ ...valid, vulnerableVersionRange: '>= 5.0.0,, <= 5.2.1' }],
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /malformed checked-in advisory evidence/)
})

test('rejects null and non-object advisory records without throwing', () => {
  for (const advisory of [null, 'not-an-object', 42, []]) {
    const result = evaluateLockedAdvisories('packages: {}\n', {
      ...advisoryEvidence,
      advisories: [advisory],
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /malformed checked-in advisory evidence/)
  }
})

test('requires patched floors above bounded vulnerable intervals', () => {
  const valid = advisoryEvidence.advisories[1]
  for (const advisory of [
    { ...valid, firstPatchedVersion: '4.9.9' },
    { ...valid, firstPatchedVersion: '5.2.1' },
    { ...valid, vulnerableVersionRange: '>= 5.0.0, < 5.2.2', firstPatchedVersion: '5.2.1' },
  ]) {
    const result = evaluateLockedAdvisories('packages: {}\n', {
      ...advisoryEvidence,
      advisories: [advisory],
    })
    assert.equal(result.ok, false)
    assert.match(result.message, /first patched version .* contradicts/i)
  }

  const exclusiveUpper = evaluateLockedAdvisories('packages: {}\n', {
    ...advisoryEvidence,
    advisories: [{
      ...valid,
      vulnerableVersionRange: '>= 5.0.0, < 5.2.2',
      firstPatchedVersion: '5.2.2',
    }],
  })
  assert.equal(exclusiveUpper.ok, true, exclusiveUpper.message)
})

test('validates the complete evidence set before matching the lock', () => {
  const [postcss, jsYaml] = advisoryEvidence.advisories
  const result = evaluateLockedAdvisories('packages:\n  postcss@8.5.16: {}\n', {
    ...advisoryEvidence,
    advisories: [
      postcss,
      { ...jsYaml, package: '   ' },
    ],
  })

  assert.equal(result.ok, false)
  assert.match(result.message, /malformed checked-in advisory evidence/)
  assert.doesNotMatch(result.message, /postcss@8\.5\.16/)
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

test('js-yaml override is bounded to the intended 5.x major', async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const workspace = await readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8')

  assert.match(workspace, /"js-yaml@>=5\.0\.0 <6\.0\.0": 5\.2\.3/)
  assert.doesNotMatch(workspace, /"js-yaml@>=5\.0\.0":/)
})

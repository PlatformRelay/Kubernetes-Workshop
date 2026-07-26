/**
 * Unit tests for workshop provenance resolution (US-BETA-8).
 * Run: node --test scripts/workshop-provenance.test.mjs
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveProvenance, shortSha, isVersionTag } from './workshop-provenance.mjs'

describe('shortSha', () => {
  it('truncates to 7 hex chars', () => {
    assert.equal(shortSha('abcdef0123456789'), 'abcdef0')
  })
  it('returns empty for blank input', () => {
    assert.equal(shortSha(''), '')
    assert.equal(shortSha(undefined), '')
    assert.equal(shortSha('   '), '')
  })
})

describe('isVersionTag', () => {
  it('accepts v-prefixed semver tags', () => {
    assert.equal(isVersionTag('v1.2.0'), true)
    assert.equal(isVersionTag('v0.2.0-beta.1'), true)
  })
  it('rejects branch names and empty', () => {
    assert.equal(isVersionTag('main'), false)
    assert.equal(isVersionTag('feat/us-beta-8'), false)
    assert.equal(isVersionTag(''), false)
    assert.equal(isVersionTag(undefined), false)
  })
})

describe('resolveProvenance', () => {
  it('uses explicit VITE_WORKSHOP_* when set (release inject)', () => {
    const p = resolveProvenance({
      VITE_WORKSHOP_VERSION: 'v1.2.0',
      VITE_WORKSHOP_SHA: 'deadbeefcafebabe',
    })
    assert.equal(p.version, 'v1.2.0')
    assert.equal(p.sha, 'deadbee')
    assert.equal(p.label, 'v1.2.0 · deadbee')
  })

  it('falls back to GITHUB_REF_NAME only when it looks like a version tag', () => {
    const p = resolveProvenance({
      GITHUB_REF_NAME: 'v0.2.0-beta.1',
      GITHUB_SHA: '1234567890abcdef',
    })
    assert.equal(p.version, 'v0.2.0-beta.1')
    assert.equal(p.sha, '1234567')
    assert.equal(p.label, 'v0.2.0-beta.1 · 1234567')
  })

  it('local / branch CI build → clear dev marker, not a branch name as version', () => {
    const p = resolveProvenance({
      GITHUB_REF_NAME: 'main',
      GITHUB_SHA: 'abcdef0123456789',
    })
    assert.equal(p.version, 'dev')
    assert.equal(p.sha, 'abcdef0')
    assert.equal(p.label, 'dev · abcdef0')
  })

  it('no env and no git → dev · unversioned', () => {
    const p = resolveProvenance({})
    assert.equal(p.version, 'dev')
    assert.equal(p.sha, 'unversioned')
    assert.equal(p.label, 'dev · unversioned')
  })

  it('prefers gitSha when GITHUB_SHA is absent', () => {
    const p = resolveProvenance({ gitSha: 'fedcba9876543210' })
    assert.equal(p.version, 'dev')
    assert.equal(p.sha, 'fedcba9')
  })

  it('VITE overrides beat GITHUB_* and gitSha', () => {
    const p = resolveProvenance({
      VITE_WORKSHOP_VERSION: 'v9.9.9',
      VITE_WORKSHOP_SHA: '111111122222222',
      GITHUB_REF_NAME: 'v1.0.0',
      GITHUB_SHA: '999999988888888',
      gitSha: 'aaaaaaaaaaaaaaaa',
    })
    assert.equal(p.label, 'v9.9.9 · 1111111')
  })
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Extract the fenced yaml block that follows a heading substring. */
function yamlAfterHeading(src, heading) {
  const idx = src.indexOf(heading)
  assert.ok(idx >= 0, `heading not found: ${heading}`)
  const after = src.slice(idx)
  const m = after.match(/```ya?ml[^\n]*\n([\s\S]*?)```/)
  assert.ok(m, `yaml fence not found after: ${heading}`)
  return m[1]
}

const MAX_CODE_LINE = 64

describe('dense code-annotated slides stay within column width', () => {
  it('CRD teaching slide has no ultra-wide yaml lines', () => {
    const src = readFileSync(join(root, 'pages/S22-operator-pattern/index.md'), 'utf8')
    const block = yamlAfterHeading(src, 'A CRD teaches the API server a new kind')
    const long = block.split('\n').filter((l) => l.length > MAX_CODE_LINE)
    assert.deepEqual(long, [], `lines longer than ${MAX_CODE_LINE}:\n${long.join('\n')}`)
    assert.match(block, /openAPIV3Schema:\n/)
  })

  it('manifest checklist slide has no ultra-wide yaml lines', () => {
    const src = readFileSync(join(root, 'pages/S26-best-practices/index.md'), 'utf8')
    const block = yamlAfterHeading(src, 'The manifest that fails the checklist')
    const long = block.split('\n').filter((l) => l.length > MAX_CODE_LINE)
    assert.deepEqual(long, [], `lines longer than ${MAX_CODE_LINE}:\n${long.join('\n')}`)
    assert.doesNotMatch(block, /image:.*#/)
  })
})

describe('CKA design-checklist slide fits vertically', () => {
  it('uses a dense two-column grid instead of an 8-row markdown table', () => {
    const src = readFileSync(join(root, 'pages/S27-wrap-up/index.md'), 'utf8')
    const idx = src.indexOf('The CKAD/CKA domains are really a **design checklist**')
    assert.ok(idx >= 0)
    const window = src.slice(idx, idx + 1200)
    assert.match(window, /kw-slide-dense/)
    assert.match(window, /grid-cols-2/)
    assert.doesNotMatch(window, /\|\s*Exam domain\s*\|/)
    assert.match(window, /break → fix/)
  })
})

describe('code-annotated layout contains code column overflow', () => {
  it('sets min-width:0 and overflow on the code column', () => {
    const css = readFileSync(join(root, 'theme/layouts/code-annotated.vue'), 'utf8')
    assert.match(css, /\.kw-ca-code\s*\{[^}]*min-width:\s*0/s)
    assert.match(css, /\.kw-ca-code\s*\{[^}]*overflow:\s*auto/s)
    assert.match(css, /\.kw-ca-rail\s*\{[^}]*min-width:\s*0/s)
  })
})

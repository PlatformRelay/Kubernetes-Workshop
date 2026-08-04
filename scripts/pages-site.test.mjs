#!/usr/bin/env node
// Assert Pages workflow / build script keep Slidev under /deck/ with hash routing.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('pages.yml builds Slidev with hash router under /deck/', () => {
  const wf = readFileSync(resolve(ROOT, '.github/workflows/pages.yml'), 'utf8')
  assert.match(wf, /pages-build\.sh/)
  assert.match(wf, /PAGES_BASE/)
  assert.match(wf, /mkdocs|MkDocs/)
})

test('pages-build.sh mirrors hash + deck layout', () => {
  const sh = readFileSync(resolve(ROOT, 'scripts/pages-build.sh'), 'utf8')
  assert.match(sh, /--router-mode hash/)
  assert.match(sh, /deck\/day-1/)
  assert.match(sh, /mkdocs build/)
})

test('mkdocs.yml site_url uses canonical Kubernetes-Workshop case', () => {
  const yml = readFileSync(resolve(ROOT, 'mkdocs.yml'), 'utf8')
  assert.match(yml, /site_url:\s*https:\/\/platformrelay\.github\.io\/Kubernetes-Workshop\//)
})

test('docs landing and run-slides exist', () => {
  assert.ok(existsSync(resolve(ROOT, 'docs/index.md')))
  assert.ok(existsSync(resolve(ROOT, 'docs/run-slides.md')))
  assert.ok(existsSync(resolve(ROOT, 'docs/downloads.md')))
})

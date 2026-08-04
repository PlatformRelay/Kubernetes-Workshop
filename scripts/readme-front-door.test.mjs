#!/usr/bin/env node
// Front-door honesty: stable release banner state + live deck discovery on README.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PAGES = 'https://platformrelay.github.io/Kubernetes-Workshop'

test('README has no controlled-beta warning', () => {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
  assert.doesNotMatch(
    readme,
    /Controlled beta/i,
    'README must not ship a controlled-beta warning after the stable exit',
  )
})

test('docs landing has no controlled-beta admonition', () => {
  const index = readFileSync(resolve(ROOT, 'docs/index.md'), 'utf8')
  assert.doesNotMatch(index, /Controlled beta/i)
  assert.doesNotMatch(index, /!!!\s*warning\s*"Controlled beta"/)
})

test('README links live Day 1/2/3 decks on Pages', () => {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
  for (const day of ['day-1', 'day-2', 'day-3']) {
    assert.match(
      readme,
      new RegExp(`${PAGES.replace(/\./g, '\\.')}/deck/${day}/`),
      `README must link the live ${day} deck`,
    )
  }
})

test('LICENSE is 0BSD (no attribution required)', () => {
  const license = readFileSync(resolve(ROOT, 'LICENSE'), 'utf8')
  assert.match(license, /BSD Zero Clause License|0BSD/i)
  assert.doesNotMatch(
    license,
    /The above copyright notice and this permission notice shall be included/,
  )
})

test('README describes 0BSD without MIT attribution requirement', () => {
  const readme = readFileSync(resolve(ROOT, 'README.md'), 'utf8')
  assert.match(readme, /0BSD/)
  assert.doesNotMatch(readme, /Keep the copyright notice with substantial copies/)
  assert.doesNotMatch(readme, /\[MIT License\]|\*\*\[MIT\]|License: MIT/)
})

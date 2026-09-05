#!/usr/bin/env node
// Assert Pages workflow / build script keep Slidev under /deck/ with hash routing.
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve, dirname, join, extname } from 'node:path'
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

test('public roadmap page exists for MkDocs', () => {
  assert.ok(existsSync(resolve(ROOT, 'docs/roadmap.md')))
})

// ---------------------------------------------------------------------------
// US-QUIZ-4 — the static self-check player is published at /quiz/.
//
// These tests build the real tree with the same script `pages-build.sh` runs and
// then drive it in a browser, rather than asserting on the shell script's text.
// ---------------------------------------------------------------------------

const PLAYER_ASSETS = ['index.html', 'player.css', 'app.mjs', 'logic.mjs', 'questions.json', 'sections.json']

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

// Minimal localhost file server: ES modules and fetch() both need an http origin,
// so the built tree is served exactly as GitHub Pages would serve it.
//
// The built tree is a flat, fully known set of files (PLAYER_ASSETS), so a request
// is resolved by looking its name up in that list and serving the entry found
// there. Nothing the request says is ever joined onto a filesystem path, which is
// both the simplest containment guarantee for a server that runs in CI and what
// keeps CodeQL's js/path-injection rule satisfied.
function serveStatic(rootDirectory) {
  const rootDir = resolve(rootDirectory)
  const server = createServer((request, response) => {
    const url = request.url.split('?')[0].split('#')[0]
    const wanted = url === '/' || url === '' ? 'index.html' : decodeURIComponent(url).replace(/^\/+/, '')
    const asset = PLAYER_ASSETS.find(candidate => candidate === wanted)
    if (!asset || !existsSync(join(rootDir, asset))) {
      response.writeHead(404)
      response.end('missing')
      return
    }
    response.writeHead(200, { 'content-type': MIME[extname(asset)] ?? 'application/octet-stream' })
    response.end(readFileSync(join(rootDir, asset)))
  })
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }))
  })
}

function buildQuizTree() {
  const directory = mkdtempSync(join(tmpdir(), 'pages-quiz-'))
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/quiz/build-player.mjs'), '--out', directory], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  return directory
}

test('build-player.mjs emits a complete /quiz/ tree', () => {
  const directory = buildQuizTree()
  for (const asset of PLAYER_ASSETS)
    assert.ok(existsSync(join(directory, asset)), `built quiz tree is missing ${asset}`)

  const bank = JSON.parse(readFileSync(resolve(ROOT, 'quiz/questions.json'), 'utf8'))
  const shipped = JSON.parse(readFileSync(join(directory, 'questions.json'), 'utf8'))
  assert.deepEqual(
    shipped.questions.map(question => question.id),
    bank.questions.map(question => question.id),
  )
  const html = readFileSync(join(directory, 'index.html'), 'utf8')
  assert.match(html, /<script[^>]+type="module"[^>]+src="app\.mjs"/)
})

test('pages-build.sh publishes the built player under the site tree', () => {
  const sh = readFileSync(resolve(ROOT, 'scripts/pages-build.sh'), 'utf8')
  assert.match(sh, /scripts\/quiz\/build-player\.mjs/)
  assert.match(sh, /\$\{SITE\}\/quiz/)
})

test('the published player answers, explains, finishes, and returns to the landing page', { timeout: 120_000 }, async () => {
  const directory = buildQuizTree()
  const bank = JSON.parse(readFileSync(resolve(ROOT, 'quiz/questions.json'), 'utf8'))
  const { chromium } = await import('playwright-chromium')
  const { server, port } = await serveStatic(directory)
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const origin = `http://127.0.0.1:${port}`

    // Landing page: authored sections grouped by day, deferred S24 absent.
    await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="section-link"]')
    const listed = await page.$$eval('[data-testid="section-link"]', nodes => nodes.map(node => node.dataset.section))
    assert.ok(listed.includes('S05'))
    assert.ok(!listed.includes('S24'), 'the deferred section must not be offered')

    // A valid section id with no questions must still render the landing page.
    await page.goto(`${origin}/#S24`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="section-link"]')
    assert.match(await page.textContent('[data-testid="notice"]'), /S24/)

    // Deep link into one section and answer wrong: explanation + rationale.
    const questions = bank.questions.filter(question => question.section === 'S05')
    await page.goto(`${origin}/#S05`, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid="option"]')
    const first = questions[0]
    const distractor = first.options.find(option => option.id !== first.answer)
    await page.click(`[data-testid="option"][data-option="${distractor.id}"]`)
    const feedback = await page.textContent('[data-testid="feedback"]')
    assert.match(feedback, new RegExp(first.explanation.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(feedback, new RegExp(distractor.rationale.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))

    // The choice locks: a graded question is marked aria-disabled and its click
    // handler ignores further picks, so the verdict cannot be rewritten.
    const other = first.options.find(option => option.id !== distractor.id)
    assert.equal(
      await page.getAttribute(`[data-testid="option"][data-option="${other.id}"]`, 'aria-disabled'),
      'true',
    )
    await page.dispatchEvent(`[data-testid="option"][data-option="${other.id}"]`, 'click')
    assert.equal(
      await page.getAttribute(`[data-testid="option"][data-option="${distractor.id}"]`, 'data-state'),
      'chosen',
    )

    // Walk to the last question; the forward control is never disabled.
    for (let index = 0; index < questions.length; index++) {
      assert.equal(await page.isDisabled('[data-testid="advance"]'), false, 'the forward control must stay live')
      await page.click('[data-testid="advance"]')
    }

    // The last click lands on the score, which offers the landing page back.
    await page.waitForSelector('[data-testid="score"]')
    assert.match(await page.textContent('[data-testid="score"]'), new RegExp(`of ${questions.length}`))
    await page.click('[data-testid="to-landing"]')
    await page.waitForSelector('[data-testid="section-link"]')
  }
  finally {
    await browser.close()
    server.close()
  }
})

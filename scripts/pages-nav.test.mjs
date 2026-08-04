#!/usr/bin/env node
// Regression net for Slidev #2635 / #2622: with --base + hash router, navigation must
// push `/#/2` (not `/#/<base>/2`). 52.16.0 double-prefixed BASE_URL and broke GH Pages.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdirSync, readFileSync, existsSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/Kubernetes-Workshop/deck/day-1'

function readInstalledSlidePathHelper() {
  const slidePath = join(ROOT, 'node_modules/@slidev/client/logic/slidePath.ts')
  const slides = join(ROOT, 'node_modules/@slidev/client/logic/slides.ts')
  if (existsSync(slidePath))
    return readFileSync(slidePath, 'utf8')
  return readFileSync(slides, 'utf8')
}

test('installed Slidev client keeps route paths base-relative (no BASE_URL prefix)', () => {
  const src = readInstalledSlidePathHelper()
  assert.doesNotMatch(
    src,
    /return\s+`\$\{import\.meta\.env\.BASE_URL\}/,
    'getSlidePath must not prefix BASE_URL (Slidev 52.16 regression #2635)',
  )
  assert.match(src, /\/\$\{no\}|\/export\/\$\{no\}/)
})

function run(cmd, args, opts = {}) {
  return new Promise((resolveP, reject) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts })
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('close', (code) => {
      if (code === 0)
        resolveP({ out, err })
      else
        reject(new Error(`${cmd} ${args.join(' ')} exited ${code}\n${err || out}`))
    })
  })
}

function serveStatic(root, basePrefix) {
  const mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  }
  const server = createServer((req, res) => {
    let url = req.url.split('?')[0]
    if (url.startsWith(basePrefix))
      url = url.slice(basePrefix.length) || '/'
    let file = join(root, decodeURIComponent(url))
    if (url.endsWith('/') || !extname(file)) {
      if (url === '/' || url === '')
        file = join(root, 'index.html')
      else {
        res.writeHead(404, { 'content-type': 'text/html' })
        res.end(readFileSync(join(root, '404.html')))
        return
      }
    }
    if (!existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404)
      res.end('missing')
      return
    }
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' })
    res.end(readFileSync(file))
  })
  return new Promise((resolveP) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      resolveP({ server, port })
    })
  })
}

test('hash+base build navigates to #/2 not #/<base>/2', { timeout: 120_000 }, async () => {
  // Keep the fixture inside the repo: Vite/Rolldown 8 rejects absolute outDir paths
  // that resolve outside the project root when the entry also lives outside.
  const dir = join(ROOT, '.tmp-pages-nav')
  rmSync(dir, { recursive: true, force: true })
  const entry = join(dir, 'slides.md')
  const out = join(dir, 'dist')
  mkdirSync(dir, { recursive: true })
  writeFileSync(entry, `---\ntheme: default\n---\n\n# One\n\n---\n\n# Two\n`)
  try {
    await run('pnpm', [
      'exec', 'slidev', 'build', entry,
      '--base', `${BASE}/`,
      '--out', out,
      '--router-mode', 'hash',
    ])

    const { chromium } = await import('playwright-chromium')
    const { server, port } = await serveStatic(out, BASE)
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(`http://127.0.0.1:${port}${BASE}/`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(800)
      assert.match(page.url(), /#\/1$/)

      // Advance past any title clicks to slide 2.
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(250)
        if (/#\/2$/.test(page.url()))
          break
      }

      assert.match(
        page.url(),
        /#\/2$/,
        `expected hash slide 2, got ${page.url()} (Slidev base×hash double-prefix?)`,
      )
      assert.doesNotMatch(page.url(), /#\/Kubernetes-Workshop\//)
    }
    finally {
      await browser.close()
      server.close()
    }
  }
  finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

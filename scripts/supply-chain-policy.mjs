#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ACTION_SHA = /^[0-9a-f]{40}$/i
const VERSION_COMMENT = /^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/
const DOWNLOAD_COMMAND = /\b(?:curl|wget)\b/
const PYTHON_REMOTE_INPUT = /\b(?:urllib\.request\.)?(?:urlopen|urlretrieve)\s*\(|\brequests\.(?:get|post|put|patch|delete)\s*\(/
const URL_PATTERN = /https?:\/\/[^\s'"|)]+/g
const SHELL_PIPE = /\|\s*(?:ba)?sh\b/
const EXCEPTION_MARKER = /supply-chain-exception:\s*([a-z0-9][a-z0-9-]*)/i

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

async function readOptionalJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw new Error(`${path.relative(process.cwd(), file)} is not valid JSON: ${error.message}`)
  }
}

async function filesUnder(root) {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    const nested = await Promise.all(entries.map((entry) => {
      const target = path.join(root, entry.name)
      return entry.isDirectory() ? filesUnder(target) : [target]
    }))
    return nested.flat()
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

function relative(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

function validateExceptions(exceptions, today, errors) {
  const byId = new Map()
  for (const exception of exceptions) {
    if (!exception.id || !exception.source || !exception.kind || !exception.reason || !exception.expires) {
      errors.push('supply-chain/exceptions.json: remote input exceptions require id, source, kind, reason, and expires')
      continue
    }
    if (!isIsoDate(exception.expires)) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} has an invalid expiry date`)
      continue
    }
    if (!/^https:\/\//.test(exception.source)) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} source must be an exact HTTPS URL`)
      continue
    }
    if (!['accepted-risk', 'sha256'].includes(exception.kind)) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} kind must be accepted-risk or sha256`)
      continue
    }
    if (exception.kind === 'sha256' && !/^[0-9a-f]{64}$/i.test(exception.sha256 ?? '')) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} requires a 64-character sha256`)
      continue
    }
    if (exception.expires < today) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} expired on ${exception.expires}`)
      continue
    }
    byId.set(exception.id, exception)
  }
  return byId
}

async function checkActions(root, errors) {
  const workflowRoot = path.join(root, '.github', 'workflows')
  const workflows = (await filesUnder(workflowRoot)).filter((file) => /\.ya?ml$/.test(file))
  for (const file of workflows) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    lines.forEach((line, index) => {
      const match = line.match(/\buses:\s*([^\s#]+)(?:\s*#\s*(.+))?$/)
      if (!match || match[1].startsWith('./')) return
      if (match[1].startsWith('docker://')) {
        if (!/@sha256:[0-9a-f]{64}$/i.test(match[1])) {
          errors.push(`${relative(root, file)}:${index + 1}: container action must use an immutable sha256 digest`)
        }
        return
      }
      const at = match[1].lastIndexOf('@')
      const ref = at === -1 ? '' : match[1].slice(at + 1)
      const location = `${relative(root, file)}:${index + 1}`
      if (!ACTION_SHA.test(ref)) {
        errors.push(`${location}: third-party action must use an immutable 40-character commit SHA`)
        return
      }
      const comment = match[2]?.trim().split(/\s+/)[0] ?? ''
      if (!VERSION_COMMENT.test(comment)) {
        errors.push(`${location}: pinned action requires a version comment such as "# v4.2.2"`)
      }
    })
  }
}

function checkWorkflowPermissions(root, file, contents, errors) {
  const lines = contents.split(/\r?\n/)
  const start = lines.findIndex((line) => /^permissions\s*:/.test(line))
  const location = relative(root, file)
  if (start === -1) {
    errors.push(`${location}: workflow must declare explicit read-only top-level permissions`)
    return
  }
  const permissionLines = [lines[start]]
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^[^\s#]/.test(lines[index])) break
    permissionLines.push(lines[index])
  }
  if (/\bwrite(?:-all)?\b/.test(permissionLines.join('\n'))) {
    errors.push(`${location}:${start + 1}: workflow-wide write permission is forbidden; grant write only on the publishing job`)
  }
}

function exceptionAllows(exception, urls, verificationWindow) {
  if (!exception || urls.length !== 1 || urls[0] !== exception.source) return false
  if (exception.kind === 'accepted-risk') return true
  return verificationWindow.includes(exception.sha256) && /sha256sum\s+-c/.test(verificationWindow)
}

function isLoopback(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

async function checkRemoteInputs(root, exceptionById, errors) {
  const candidates = [
    ...(await filesUnder(path.join(root, 'infra'))),
    ...(await filesUnder(path.join(root, 'setup'))),
    ...(await filesUnder(path.join(root, 'scripts'))),
    ...(await filesUnder(path.join(root, '.github'))),
    path.join(root, 'workshop'),
    path.join(root, 'Makefile'),
    path.join(root, 'package.json'),
    path.join(root, 'mise.toml'),
  ].filter((file) => /(?:\.sh|\.bash|\.ya?ml|\.json|\.toml)$/.test(file) || ['workshop', 'Makefile'].includes(path.basename(file)))

  for (const file of candidates) {
    let contents
    try {
      contents = await readFile(file, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    const physicalLines = contents.split(/\r?\n/)
    const lines = []
    let current = ''
    let startLine = 1
    physicalLines.forEach((line, index) => {
      if (current === '') startLine = index + 1
      current += `${current ? ' ' : ''}${line.replace(/\\\s*$/, '')}`
      if (/\\\s*$/.test(line)) return
      lines.push({ text: current, startLine })
      current = ''
    })
    if (current) lines.push({ text: current, startLine })

    lines.forEach(({ text: line, startLine: lineNumber }, index) => {
      if (/^(?:#|say\s)/.test(line.trim())) return
      if (!DOWNLOAD_COMMAND.test(line)) return
      const command = line.slice(line.search(DOWNLOAD_COMMAND))
      if (/\$(?:\{|[A-Za-z_])/.test(command)) {
        errors.push(`${relative(root, file)}:${lineNumber}: dynamic curl/wget source is not auditable; use an exact HTTPS source`)
        return
      }
      const urls = [...line.matchAll(URL_PATTERN)].map((match) => match[0])
      if (urls.length === 0) {
        errors.push(`${relative(root, file)}:${lineNumber}: dynamic curl/wget source is not auditable; use an exact HTTPS source`)
        return
      }
      const remoteUrls = urls.filter((url) => !isLoopback(url))
      if (remoteUrls.length === 0) return
      const marker = `${lines[index - 1]?.text ?? ''} ${line}`.match(EXCEPTION_MARKER)?.[1]
      const exception = marker ? exceptionById.get(marker) : undefined
      const verificationWindow = line
      if (!exceptionAllows(exception, remoteUrls, verificationWindow)) {
        if (exception && !remoteUrls.includes(exception.source)) {
          errors.push(`${relative(root, file)}:${lineNumber}: exception ${exception.id} source does not match the command`)
          return
        }
        const operation = SHELL_PIPE.test(line) ? 'execution' : 'download'
        errors.push(`${relative(root, file)}:${lineNumber}: unverified remote ${operation} requires a documented, unexpired exception`)
      }
    })
  }
}

async function checkPythonRemoteInputs(root, exceptionById, errors) {
  const candidates = [
    ...(await filesUnder(path.join(root, 'infra'))),
    ...(await filesUnder(path.join(root, 'setup'))),
    ...(await filesUnder(path.join(root, 'scripts'))),
    ...(await filesUnder(path.join(root, '.github'))),
  ].filter((file) => /(?:\.py|\.ya?ml)$/.test(file))

  for (const file of candidates) {
    const lines = (await readFile(file, 'utf8')).split(/\r?\n/)
    lines.forEach((line, index) => {
      if (line.trim().startsWith('#') || !PYTHON_REMOTE_INPUT.test(line)) return
      const urls = [...line.matchAll(URL_PATTERN)].map((match) => match[0]).filter((url) => !isLoopback(url))
      if (urls.length === 0) {
        errors.push(`${relative(root, file)}:${index + 1}: dynamic Python remote input is not auditable; use an exact HTTPS source`)
        return
      }
      const marker = `${lines[index - 1] ?? ''} ${line}`.match(EXCEPTION_MARKER)?.[1]
      const exception = marker ? exceptionById.get(marker) : undefined
      const verificationWindow = line
      if (!exceptionAllows(exception, urls, verificationWindow)) {
        errors.push(`${relative(root, file)}:${index + 1}: unverified Python remote input requires a documented, unexpired exception`)
      }
    })
  }
}

async function checkMiseLock(root, errors) {
  let contents
  try {
    contents = await readFile(path.join(root, 'mise.lock'), 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return
    throw error
  }
  let hasChecksum = false
  contents.split(/\r?\n/).forEach((line, index) => {
    if (line.startsWith('[')) hasChecksum = false
    if (/^checksum\s*=\s*"sha256:[0-9a-f]{64}"$/i.test(line)) hasChecksum = true
    if (/^url\s*=\s*"https?:\/\//.test(line) && !hasChecksum) {
      errors.push(`mise.lock:${index + 1}: mise.lock URL without adjacent sha256 checksum`)
    }
  })
}

export async function checkSupplyChainPolicy(root = process.cwd(), options = {}) {
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  const errors = []
  const policy = await readOptionalJson(path.join(root, 'supply-chain', 'exceptions.json'), {
    remoteInputs: [],
  })
  const exceptionById = validateExceptions(policy.remoteInputs ?? [], today, errors)
  await checkActions(root, errors)
  const workflows = (await filesUnder(path.join(root, '.github', 'workflows'))).filter((file) => /\.ya?ml$/.test(file))
  for (const workflow of workflows) {
    const contents = await readFile(workflow, 'utf8')
    checkWorkflowPermissions(root, workflow, contents, errors)
  }
  await checkRemoteInputs(root, exceptionById, errors)
  await checkPythonRemoteInputs(root, exceptionById, errors)
  await checkMiseLock(root, errors)
  return { errors }
}

async function main() {
  const result = await checkSupplyChainPolicy()
  if (result.errors.length > 0) {
    console.error(result.errors.join('\n'))
    process.exitCode = 1
    return
  }
  console.log('Supply-chain policy passed: Actions pinned, remote inputs governed, mise downloads checksummed.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}

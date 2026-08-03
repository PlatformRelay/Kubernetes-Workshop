#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ACTION_SHA = /^[0-9a-f]{40}$/i
const VERSION_COMMENT = /^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/
const REMOTE_DOWNLOAD = /\b(?:curl|wget)\b[^\n]*https?:\/\//
const SHELL_PIPE = /\|\s*(?:ba)?sh\b/
const EXCEPTION_MARKER = /supply-chain-exception:\s*([a-z0-9][a-z0-9-]*)/i

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
    if (!exception.id || !exception.reason || !exception.expires) {
      errors.push('supply-chain/exceptions.json: remote input exceptions require id, reason, and expires')
      continue
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.expires)) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} has an invalid expiry date`)
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

async function checkRemoteInputs(root, exceptionById, errors) {
  const candidates = [
    ...(await filesUnder(path.join(root, 'infra'))),
    ...(await filesUnder(path.join(root, 'setup'))),
    path.join(root, 'workshop'),
  ].filter((file) => /(?:\.sh|\.bash)$/.test(file) || path.basename(file) === 'workshop')

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
      if (!REMOTE_DOWNLOAD.test(line)) return
      const marker = `${lines[index - 1]?.text ?? ''} ${line}`.match(EXCEPTION_MARKER)?.[1]
      if (!marker || !exceptionById.has(marker)) {
        const operation = SHELL_PIPE.test(line) ? 'execution' : 'download'
        errors.push(`${relative(root, file)}:${lineNumber}: unverified remote ${operation} requires a documented, unexpired exception`)
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
  await checkRemoteInputs(root, exceptionById, errors)
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

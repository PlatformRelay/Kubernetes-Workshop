#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

const ACTION_SHA = /^[0-9a-f]{40}$/i
const VERSION_COMMENT = /^v?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/
const DOWNLOAD_COMMAND = /\b(?:curl|wget)\b/
const DYNAMIC_NETWORK_CALL = /\b(?:fetch|urlopen|urlretrieve)\s*\(|\brequests\.(?:request|get|post|put|patch|delete)\s*\(/
const URL_PATTERN = /https?:\/\/[^\s'"|)]+/g
const SHELL_PIPE = /\|\s*(?:ba)?sh\b/
const EXCEPTION_MARKER = /supply-chain-exception:\s*([a-z0-9][a-z0-9-]*)/i
const ALLOWED_JOB_WRITES = new Map([
  ['pages.yml:deploy', new Set(['pages', 'id-token'])],
  ['release.yml:publish', new Set(['contents'])],
  ['workshop-web.yml:build', new Set(['packages', 'id-token'])],
  // CodeQL uploads SARIF to the code-scanning dashboard (US-CI-CODEQL).
  ['codeql.yml:analyze', new Set(['security-events'])],
])

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
    if (exception.kind === 'accepted-risk' && !exception.command) {
      errors.push(`supply-chain/exceptions.json: ${exception.id} accepted-risk requires an exact command`)
      continue
    }
    if (exception.kind === 'sha256') {
      if (!/^[0-9a-f]{64}$/i.test(exception.sha256 ?? '') || !/^[A-Za-z0-9._-]+$/.test(exception.output ?? '')) {
        errors.push(`supply-chain/exceptions.json: ${exception.id} requires a 64-character sha256 and simple output filename`)
        continue
      }
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
      if (line.trimStart().startsWith('#')) return
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
  const location = relative(root, file)
  let workflow
  try {
    workflow = parseYaml(contents)
  } catch (error) {
    errors.push(`${location}: workflow is not valid YAML: ${error.message}`)
    return
  }
  if (!workflow || typeof workflow !== 'object' || !Object.hasOwn(workflow, 'permissions')) {
    errors.push(`${location}: workflow must declare explicit read-only top-level permissions`)
    return
  }
  const topLevel = workflow.permissions
  const topLevelWrites = topLevel === 'write-all'
    || (topLevel && typeof topLevel === 'object' && Object.values(topLevel).includes('write'))
  if (topLevelWrites) {
    errors.push(`${location}: workflow-wide write permission is forbidden; grant write only on the publishing job`)
  }

  for (const [currentJob, job] of Object.entries(workflow.jobs ?? {})) {
    if (!job || typeof job !== 'object' || !Object.hasOwn(job, 'permissions')) continue
    const allowed = ALLOWED_JOB_WRITES.get(`${path.basename(file)}:${currentJob}`) ?? new Set()
    if (job.permissions === 'write-all') {
      errors.push(`${location}: job-level write permission write-all is not allowed for ${currentJob}`)
      continue
    }
    if (!job.permissions || typeof job.permissions !== 'object') continue
    for (const [scope, access] of Object.entries(job.permissions)) {
      if (access === 'write' && !allowed.has(scope)) {
        errors.push(`${location}: job-level write permission ${scope}:write is not allowed for ${currentJob}`)
      }
    }
  }
}

function isLoopback(url) {
  try {
    return ['localhost', '127.0.0.1', '::1'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

function stripLanguageComments(contents, language) {
  let quote = ''
  let escaped = false
  let blockComment = false
  let result = ''
  for (let index = 0; index < contents.length; index += 1) {
    const char = contents[index]
    const next = contents[index + 1]
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false
        result += '  '
        index += 1
      } else {
        result += char === '\n' ? '\n' : ' '
      }
      continue
    }
    if (quote) {
      result += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || (language === 'node' && char === '`')) {
      quote = char
      result += char
      continue
    }
    if (language === 'python' && char === '#') {
      while (index < contents.length && contents[index] !== '\n') index += 1
      result += index < contents.length ? '\n' : ''
      continue
    }
    if (language === 'node' && char === '/' && next === '/') {
      while (index < contents.length && contents[index] !== '\n') index += 1
      result += index < contents.length ? '\n' : ''
      continue
    }
    if (language === 'node' && char === '/' && next === '*') {
      blockComment = true
      result += '  '
      index += 1
      continue
    }
    result += char
  }
  return result
}

function splitStatements(line) {
  const statements = []
  let quote = ''
  let escaped = false
  let current = ''
  for (const char of line) {
    if (quote) {
      current += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      current += char
    } else if (char === ';') {
      statements.push(current)
      current = ''
    } else {
      current += char
    }
  }
  statements.push(current)
  return statements
}

function maskStringContents(value) {
  let quote = ''
  let escaped = false
  let result = ''
  for (const char of value) {
    if (quote) {
      if (escaped) {
        escaped = false
        result += ' '
      } else if (char === '\\') {
        escaped = true
        result += ' '
      } else if (char === quote) {
        quote = ''
        result += char
      } else {
        result += ' '
      }
    } else if (char === '"' || char === "'" || char === '`') {
      quote = char
      result += char
    } else {
      result += char
    }
  }
  return result
}

function shellCommandNames(value) {
  const source = value.trim().replace(/^(?:-\s*)?run:\s*/, '')
  const segments = []
  let quote = ''
  let escaped = false
  let current = ''
  for (const char of source) {
    if (quote) {
      current += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (';|&'.includes(char)) {
      if (current.trim()) segments.push(current)
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) segments.push(current)

  const commands = []
  for (const segment of segments) {
    const words = []
    quote = ''
    escaped = false
    current = ''
    for (const char of segment.trim()) {
      if (quote) {
        if (escaped) {
          current += char
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === quote) {
          quote = ''
        } else {
          current += char
        }
      } else if (char === '"' || char === "'") {
        quote = char
      } else if (/\s/.test(char)) {
        if (current) words.push(current)
        current = ''
      } else {
        current += char
      }
    }
    if (current) words.push(current)

    let index = 0
    while (/^(?:if|then|do|while|until|!)$/.test(words[index] ?? '')) index += 1
    while (/^[A-Za-z_]\w*=/.test(words[index] ?? '')) index += 1
    while (/^(?:env|sudo|command|exec)$/.test(words[index] ?? '')) {
      index += 1
      while (/^-|^[A-Za-z_]\w*=/.test(words[index] ?? '')) index += 1
    }
    const command = words[index]
    if (!command) continue
    commands.push(command)
    if (/^(?:ba)?sh$/.test(command) && words[index + 1] === '-c' && words[index + 2]) {
      commands.push(...shellCommandNames(words[index + 2]))
    }
  }
  return commands
}

function languageNetworkCallsites(contents, language) {
  const requestAliases = new Set(['requests'])
  const requestFunctions = new Set()
  const urllibAliases = new Set(['urllib.request'])
  const urllibFunctions = new Set(['urlopen', 'urlretrieve'])
  const subprocessAliases = new Set(['subprocess'])
  const fetchAliases = new Set(['fetch', 'globalThis.fetch'])
  const stringVariables = new Map()
  const callsites = []
  const cleaned = stripLanguageComments(contents, language)

  cleaned.split(/\r?\n/).forEach((line, lineIndex) => {
    splitStatements(line).forEach((rawStatement) => {
      const statement = rawStatement.trim()
      if (!statement) return
      if (language === 'python') {
        const moduleImport = statement.match(/^import\s+(requests|urllib\.request|subprocess)(?:\s+as\s+([A-Za-z_]\w*))?$/)
        if (moduleImport) {
          const alias = moduleImport[2] ?? moduleImport[1]
          if (moduleImport[1] === 'requests') requestAliases.add(alias)
          if (moduleImport[1] === 'urllib.request') urllibAliases.add(alias)
          if (moduleImport[1] === 'subprocess') subprocessAliases.add(alias)
          return
        }
        const fromImport = statement.match(/^from\s+urllib\.request\s+import\s+(urlopen|urlretrieve)(?:\s+as\s+([A-Za-z_]\w*))?$/)
        if (fromImport) {
          urllibFunctions.add(fromImport[2] ?? fromImport[1])
          return
        }
        const requestImport = statement.match(/^from\s+requests\s+import\s+(request|get|post|put|patch|delete)(?:\s+as\s+([A-Za-z_]\w*))?$/)
        if (requestImport) {
          requestFunctions.add(requestImport[2] ?? requestImport[1])
          return
        }
      }

      const assignment = statement.match(language === 'python'
        ? /^([A-Za-z_]\w*)\s*=\s*(["'])(https?:\/\/.*?)\2$/
        : /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'`])(https?:\/\/.*?)\2$/)
      if (assignment) {
        stringVariables.set(assignment[1], assignment[3])
        return
      }
      if (language === 'node') {
        const alias = statement.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)$/)
        if (alias && fetchAliases.has(alias[2])) {
          fetchAliases.add(alias[1])
          return
        }
      }

      const masked = maskStringContents(statement)
      let call
      if (language === 'python') {
        const requestNames = [...requestAliases].map(escapeRegex).join('|')
        const requestFunctionNames = [...requestFunctions].map(escapeRegex).join('|')
        const urllibNames = [...urllibAliases].map(escapeRegex).join('|')
        const functionNames = [...urllibFunctions].map(escapeRegex).join('|')
        const subprocessNames = [...subprocessAliases].map(escapeRegex).join('|')
        const importedRequests = requestFunctionNames ? `|(?:${requestFunctionNames})` : ''
        call = masked.match(new RegExp(`\\b(?:(?:${requestNames})\\.(?:request|get|post|put|patch|delete)|(?:${urllibNames})\\.(?:urlopen|urlretrieve)|(?:${functionNames})${importedRequests})\\s*\\(`))
        if (!call) {
          const subprocessCall = masked.match(new RegExp(`\\b(?:${subprocessNames})\\.(?:run|call|check_call|check_output|Popen)\\s*\\(`))
          if (subprocessCall) {
            const open = masked.indexOf('(', subprocessCall.index)
            const argumentsText = statement.slice(open + 1, statement.lastIndexOf(')'))
            if (/["'](?:curl|wget)["']/.test(argumentsText)) call = subprocessCall
          }
        }
      } else {
        const fetchNames = [...fetchAliases].map(escapeRegex).join('|')
        call = masked.match(new RegExp(`\\b(?:${fetchNames})\\s*\\(`))
      }
      if (!call) return
      const open = masked.indexOf('(', call.index)
      const close = statement.lastIndexOf(')')
      const argumentsText = close > open ? statement.slice(open + 1, close) : statement.slice(open + 1)
      const urls = [...argumentsText.matchAll(URL_PATTERN)].map((match) => match[0])
      for (const [name, url] of stringVariables) {
        if (new RegExp(`\\b${escapeRegex(name)}\\b`).test(argumentsText)) urls.push(url)
      }
      const externalUrls = [...new Set(urls)].filter((url) => !isLoopback(url))
      callsites.push({ line: lineIndex + 1, externalUrls, dynamic: externalUrls.length === 0 })
    })
  })
  return callsites
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
  ].filter((file) => {
    if (/\.test\.(?:mjs|js|ts|py)$/.test(file)) return false
    if (path.basename(file) === 'supply-chain-policy.mjs') return false
    return /(?:\.sh|\.bash|\.py|\.mjs|\.js|\.cjs|\.ts|\.ya?ml|\.json|\.toml)$/.test(file)
      || ['workshop', 'Makefile'].includes(path.basename(file))
  })

  for (const file of candidates) {
    let contents
    try {
      contents = await readFile(file, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    const language = /\.py$/.test(file) ? 'python' : /\.(?:mjs|js|cjs|ts)$/.test(file) ? 'node' : ''
    if (language) {
      for (const callsite of languageNetworkCallsites(contents, language)) {
        const location = `${relative(root, file)}:${callsite.line}`
        if (callsite.dynamic) {
          errors.push(`${location}: dynamic remote source: dynamic source is not an exact reviewed callsite`)
        } else {
          const kind = language === 'python' ? 'unverified Python remote input' : 'unverified remote input'
          errors.push(`${location}: unreviewed remote-input callsite (${kind})`)
        }
      }
      continue
    }
    const physicalLines = contents.split(/\r?\n/)
    const lines = []
    let current = ''
    let startLine = 1
    physicalLines.forEach((line, index) => {
      if (current === '') startLine = index + 1
      current += `${current ? ' ' : ''}${line.replace(/\\\s*$/, '')}`
      if (/\\\s*$/.test(line)) return
      lines.push({ text: current, startLine, isComment: current.trim().startsWith('#') })
      current = ''
    })
    if (current) lines.push({ text: current, startLine, isComment: current.trim().startsWith('#') })

    const variables = new Map()
    const expandVariables = (value) => {
      let expanded = value
      for (let pass = 0; pass < 4; pass += 1) {
        const next = expanded.replace(/\$\{?([A-Za-z_][A-Za-z0-9_]*)\}?/g, (match, name) => variables.get(name) ?? match)
        if (next === expanded) break
        expanded = next
      }
      return expanded
    }
    const executable = lines.filter((entry) => !entry.isComment && entry.text.trim() !== '')

    lines.forEach((entry, index) => {
      const trimmed = entry.text.trim()
      if (entry.isComment || /^(?:say|warn|err|ok)\s/.test(trimmed)) return
      const assignment = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.+)$/)
      if (assignment && !/[;&|]/.test(assignment[2])) {
        variables.set(assignment[1], expandVariables(assignment[2]).replace(/^['"]|['"]$/g, ''))
        return
      }
      const expanded = expandVariables(trimmed)
      const urls = [...expanded.matchAll(URL_PATTERN)].map((match) => match[0]).filter((url) => !isLoopback(url))
      const hasShellClient = shellCommandNames(expanded).some((command) => DOWNLOAD_COMMAND.test(command))
      const hasDynamicClient = DYNAMIC_NETWORK_CALL.test(expanded)
      if (urls.length === 0 && [...expanded.matchAll(URL_PATTERN)].some((match) => isLoopback(match[0]))) return
      const hasDirectShellClient = shellCommandNames(trimmed).some((command) => DOWNLOAD_COMMAND.test(command))
      const directShellCommand = trimmed.slice(Math.max(0, trimmed.search(DOWNLOAD_COMMAND)))
      if (hasDirectShellClient && /\$(?:\{|[A-Za-z_])/.test(directShellCommand)) {
        errors.push(`${relative(root, file)}:${entry.startLine}: dynamic curl/wget source: dynamic source cannot match an exception`)
        return
      }
      if (urls.length === 0 && !hasShellClient && !hasDynamicClient) return
      if (urls.length > 0 && !hasShellClient && !hasDynamicClient) return
      if (urls.length === 0) {
        const kind = hasShellClient ? 'curl/wget' : 'remote'
        errors.push(`${relative(root, file)}:${entry.startLine}: dynamic ${kind} source: dynamic source is not an exact reviewed callsite`)
        return
      }

      const previous = lines[index - 1]?.text ?? ''
      const marker = `${previous} ${trimmed}`.match(EXCEPTION_MARKER)?.[1]
      const exception = marker ? exceptionById.get(marker) : undefined
      const location = `${relative(root, file)}:${entry.startLine}`
      if (!exception) {
        const legacy = hasShellClient
          ? (SHELL_PIPE.test(expanded) ? 'unverified remote execution' : 'unverified remote download')
          : (/\.py$/.test(file) ? 'unverified Python remote input' : 'unverified remote input')
        errors.push(`${location}: unreviewed remote-input callsite (${legacy})`)
        return
      }
      if (/\$(?:\{|[A-Za-z_])|`|\$\(/.test(trimmed)) {
        errors.push(`${location}: dynamic source cannot match exception ${exception.id}`)
        return
      }
      if (urls.length !== 1 || urls[0] !== exception.source) {
        errors.push(`${location}: exception ${exception.id} source does not match the command`)
        return
      }
      const normalize = (value) => value.trim().replace(/\s+/g, ' ')
      if (exception.kind === 'accepted-risk') {
        if (normalize(trimmed) !== normalize(exception.command)) {
          errors.push(`${location}: unreviewed remote-input callsite does not match exception ${exception.id}`)
        }
        return
      }

      const executableIndex = executable.indexOf(entry)
      const verify = executable[executableIndex + 1]?.text.trim() ?? ''
      const execute = executable[executableIndex + 2]?.text.trim() ?? ''
      const expectedDownload = `curl -fsSL ${exception.source} -o ${exception.output}`
      const expectedVerify = `printf '%s  %s\\n' '${exception.sha256}' '${exception.output}' | sha256sum -c -`
      const expectedExecute = `bash ${exception.output}`
      if (
        normalize(trimmed) !== normalize(expectedDownload)
        || normalize(verify) !== normalize(expectedVerify)
        || normalize(execute) !== normalize(expectedExecute)
      ) {
        errors.push(`${location}: canonical checksum flow must bind source, output, exact digest, and executed file (download=${JSON.stringify(normalize(trimmed))}, verify=${JSON.stringify(normalize(verify))}, execute=${JSON.stringify(normalize(execute))})`)
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
  console.log('Supply-chain policy passed: Actions pinned, remote inputs governed, mise.lock artifacts checksummed.')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main()
}

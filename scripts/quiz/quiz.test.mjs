import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync, gzipSync } from 'node:zlib'
import { sections as deckSections } from '../deck-manifest.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const questionsPath = path.join(root, 'quiz/questions.json')
const requiredSections = deckSections.filter(section => section.status === 'authored')

function readGzipJson(file) {
  return JSON.parse(gunzipSync(readFileSync(file), { encoding: 'utf8' }))
}

function run(script, args = []) {
  return execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

function writeEvidenceFixture(report, mutateFiles = () => {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-license-'))
  const sbomDirectory = path.join(directory, 'sbom')
  mkdirSync(sbomDirectory)
  cpSync(
    path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/sbom'),
    sbomDirectory,
    { recursive: true },
  )
  mutateFiles(directory)
  const evidencePath = path.join(directory, 'candidates.json')
  writeFileSync(evidencePath, JSON.stringify(report))
  return evidencePath
}

function completeSbom(name, sourceCommit) {
  const properties = sourceCommit
    ? [{ name: 'aquasecurity:trivy:Labels:org.opencontainers.image.revision', value: sourceCommit }]
    : []
  return {
    bomFormat: 'CycloneDX',
    metadata: { component: { name, properties } },
    components: [{ name: 'complete-component', licenses: [{ license: { id: 'MIT' } }] }],
  }
}

test('bank covers every authored section with at least two questions', () => {
  const output = run('scripts/quiz/validate.mjs')
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  const covered = new Set(bank.questions.map(question => question.section))
  assert.match(output, new RegExp(`Validated ${bank.questions.length} questions across ${covered.size} sections`))
  assert.equal(covered.size, requiredSections.length)
  for (const section of requiredSections) {
    const count = bank.questions.filter(question => question.section === section.id).length
    assert.ok(count >= 2, `${section.id} needs at least 2 questions, found ${count}`)
  }
})

test('validator fails when an authored section has fewer than two questions', () => {
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  const target = requiredSections[0].id
  bank.questions = [
    ...bank.questions.filter(question => question.section !== target),
    ...bank.questions.filter(question => question.section === target).slice(0, 1),
  ]
  if (bank.questions.length === 0) {
    bank.questions = [{
      id: 'S99-Q-PAD-01',
      section: 'S99',
      prompt: 'padding',
      options: [
        { id: 'a', text: 'a', rationale: 'a' },
        { id: 'b', text: 'b', rationale: 'b' },
        { id: 'c', text: 'c', rationale: 'c' },
      ],
      answer: 'a',
      explanation: 'padding',
      difficulty: 'introductory',
      learningObjective: 'padding',
      references: ['https://kubernetes.io/docs/'],
    }]
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-coverage-'))
  const thinPath = path.join(directory, 'thin.json')
  writeFileSync(thinPath, JSON.stringify(bank))

  assert.throws(
    () => run('scripts/quiz/validate.mjs', [thinPath]),
    error => {
      assert.match(error.stderr, new RegExp(`${target}: need at least 2 questions`))
      return true
    },
  )
})

test('validator rejects duplicate IDs and an answer outside the option set', () => {
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  bank.questions[1].id = bank.questions[0].id
  bank.questions[2].answer = 'missing'
  bank.questions[0].difficulty = 'impossible'
  bank.questions[0].unsupported = true
  bank.questions[1].section = 'S99'
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-invalid-'))
  const invalidPath = path.join(directory, 'invalid.json')
  writeFileSync(invalidPath, JSON.stringify(bank))

  assert.throws(
    () => run('scripts/quiz/validate.mjs', [invalidPath]),
    error => {
      assert.match(error.stderr, /duplicate question id/)
      assert.match(error.stderr, /answer must name exactly one option/)
      assert.match(error.stderr, /difficulty.*allowed values/)
      assert.match(error.stderr, /additional properties/)
      assert.match(error.stderr, /unknown section S99/)
      return true
    },
  )
})

test('JSON Schema rejects empty banks, empty references, and malformed option IDs', () => {
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  bank.questions[0].references = []
  bank.questions[0].options[0].id = 'INVALID!'
  bank.questions.splice(1)
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-schema-'))
  const invalidPath = path.join(directory, 'invalid.json')
  writeFileSync(invalidPath, JSON.stringify(bank))

  assert.throws(
    () => run('scripts/quiz/validate.mjs', [invalidPath]),
    error => {
      assert.match(error.stderr, /references.*must NOT have fewer than 1 items/)
      assert.match(error.stderr, /options\/0\/id.*must match pattern/)
      return true
    },
  )

  bank.questions = []
  writeFileSync(invalidPath, JSON.stringify(bank))
  assert.throws(
    () => run('scripts/quiz/validate.mjs', [invalidPath]),
    error => {
      assert.match(error.stderr, /questions.*must NOT have fewer than 1 items/)
      return true
    },
  )
})

test('offline export hides answers in participant copy and reveals reasoning separately', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-export-'))
  run('scripts/quiz/export.mjs', ['--out', directory])

  const participant = readFileSync(path.join(directory, 'participant.md'), 'utf8')
  const facilitator = readFileSync(path.join(directory, 'facilitator.md'), 'utf8')
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))

  for (const question of bank.questions) {
    assert.doesNotMatch(participant, new RegExp(`Answer:.*${question.answer}`))
    assert.match(facilitator, new RegExp(`Answer:.*${question.answer}`))
    assert.match(facilitator, new RegExp(question.explanation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('adapter preview preserves IDs but never claims unsupported automatic import', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-adapter-'))
  run('scripts/quiz/export.mjs', ['--out', directory])
  const preview = JSON.parse(readFileSync(path.join(directory, 'adapter-preview.json'), 'utf8'))

  assert.deepEqual(Object.keys(preview).sort(), ['claper', 'classquiz', 'quizdock'])
  assert.equal(preview.claper.importMode, 'manual')
  assert.equal(preview.classquiz.importMode, 'authenticated-native-export-shape')
  assert.equal(preview.quizdock.importMode, 'authenticated-rest-api')
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  const questionIds = bank.questions.map(question => question.id)
  for (const candidate of Object.values(preview)) {
    assert.equal(candidate.productionReady, false)
    assert.deepEqual(candidate.questionIds, questionIds)
  }
})

test('license gate fails closed for forbidden, unknown, and unpinned runtime evidence', () => {
  const evidence = path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/candidates.json')
  const output = run('scripts/quiz/license-gate.mjs', [evidence])
  assert.match(output, /0 of 3 candidates passed the complete-runtime FOSS gate/)

  const candidates = JSON.parse(readFileSync(evidence, 'utf8'))
  candidates.candidates[0].runtimeComponents[0].license = 'BUSL-1.1'
  candidates.candidates[0].fossGate.passed = true
  const invalidPath = writeEvidenceFixture(candidates)
  assert.throws(() => run('scripts/quiz/license-gate.mjs', [invalidPath]), /Command failed/)

  const unresolved = JSON.parse(readFileSync(evidence, 'utf8'))
  unresolved.candidates[1].dependencyLicenseCoverage = 'complete'
  unresolved.candidates[1].fossGate.passed = true
  const unresolvedPath = writeEvidenceFixture(unresolved)
  assert.throws(() => run('scripts/quiz/license-gate.mjs', [unresolvedPath]), /Command failed/)

  const emptyRuntime = JSON.parse(readFileSync(evidence, 'utf8'))
  emptyRuntime.candidates[0].runtimeComponents = []
  emptyRuntime.candidates[0].dependencyLicenseCoverage = 'complete'
  emptyRuntime.candidates[0].fossGate.passed = true
  const emptyRuntimePath = writeEvidenceFixture(emptyRuntime)
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [emptyRuntimePath]),
    error => {
      assert.match(error.stderr, /runtimeComponents must be a non-empty array/)
      return true
    },
  )

  const noSbom = JSON.parse(readFileSync(evidence, 'utf8'))
  noSbom.candidates[0].dependencyLicenseCoverage = 'complete'
  noSbom.candidates[0].fossGate.passed = true
  noSbom.candidates[0].sbomEvidence = []
  const noSbomPath = writeEvidenceFixture(noSbom)
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [noSbomPath]),
    error => {
      assert.match(error.stderr, /sbomEvidence must include exactly one source and at least one image/)
      return true
    },
  )

  const missingVerdict = JSON.parse(readFileSync(evidence, 'utf8'))
  delete missingVerdict.candidates[0].fossGate
  const missingVerdictPath = writeEvidenceFixture(missingVerdict)
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [missingVerdictPath]),
    error => {
      assert.match(error.stderr, /fossGate\.passed must be a boolean/)
      assert.doesNotMatch(error.stderr, /TypeError/)
      return true
    },
  )
})

test('license gate verifies every declared SBOM reference before trusting a rejected verdict', () => {
  const evidence = path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/candidates.json')

  const missing = JSON.parse(readFileSync(evidence, 'utf8'))
  missing.candidates[0].sbomEvidence = []
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [writeEvidenceFixture(missing)]),
    error => {
      assert.match(error.stderr, /claper: sbomEvidence must include exactly one source and at least one image/)
      return true
    },
  )

  const nonexistent = JSON.parse(readFileSync(evidence, 'utf8'))
  nonexistent.candidates[0].sbomEvidence[0].path = 'sbom/does-not-exist.cdx.json.gz'
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [writeEvidenceFixture(nonexistent)]),
    error => {
      assert.match(error.stderr, /does-not-exist.*cannot be read as gzip CycloneDX JSON/)
      return true
    },
  )

  const corrupt = JSON.parse(readFileSync(evidence, 'utf8'))
  corrupt.candidates[0].sbomEvidence[0].path = 'sbom/corrupt.cdx.json.gz'
  const corruptPath = writeEvidenceFixture(corrupt, directory => {
    writeFileSync(path.join(directory, 'sbom/corrupt.cdx.json.gz'), 'not gzip')
  })
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [corruptPath]),
    error => {
      assert.match(error.stderr, /corrupt.*cannot be read as gzip CycloneDX JSON/)
      return true
    },
  )

  const wrongIdentity = JSON.parse(readFileSync(evidence, 'utf8'))
  wrongIdentity.candidates[0].sbomEvidence[0].identity = '0000000000000000000000000000000000000000'
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [writeEvidenceFixture(wrongIdentity)]),
    error => {
      assert.match(error.stderr, /claper: source SBOM identity does not match candidate sourceCommit/)
      return true
    },
  )

  const wrongCount = JSON.parse(readFileSync(evidence, 'utf8'))
  wrongCount.candidates[0].sbomEvidence[0].componentCount += 1
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [writeEvidenceFixture(wrongCount)]),
    error => {
      assert.match(error.stderr, /claper-source.*componentCount does not match SBOM contents/)
      return true
    },
  )

  const wrongMissingCount = JSON.parse(readFileSync(evidence, 'utf8'))
  wrongMissingCount.candidates[0].sbomEvidence[0].missingLicenseCount -= 1
  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [writeEvidenceFixture(wrongMissingCount)]),
    error => {
      assert.match(error.stderr, /claper-source.*missingLicenseCount does not match SBOM contents/)
      return true
    },
  )
})

test('license gate binds application-image provenance to both evaluated and runtime source', () => {
  const sourceA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  const sourceB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  const imageDigest = `registry.example/quiz@sha256:${'c'.repeat(64)}`
  const report = {
    candidates: [{
      id: 'cross-source',
      sourceCommit: sourceA,
      applicationComponent: 'quiz',
      runtimeComponents: [{ name: 'quiz', license: 'MIT', sourceCommit: sourceB, imageDigest }],
      sbomEvidence: [
        {
          kind: 'source', path: 'sbom/source.cdx.json.gz', identity: sourceA,
          componentCount: 1, missingLicenseCount: 0,
        },
        {
          kind: 'image', role: 'application', path: 'sbom/image.cdx.json.gz', identity: imageDigest,
          runtimeComponent: 'quiz', sourceCommit: sourceB, sourceCommitStatus: 'mismatch',
          componentCount: 1, missingLicenseCount: 0,
        },
      ],
      fossGate: { passed: true },
    }],
  }
  const evidencePath = writeEvidenceFixture(report, directory => {
    const sourceSbom = completeSbom('source', null)
    sourceSbom.metadata.component.properties = [{ name: 'workshop:sourceCommit', value: sourceA }]
    writeFileSync(path.join(directory, 'sbom/source.cdx.json.gz'), gzipSync(JSON.stringify(sourceSbom)))
    writeFileSync(path.join(directory, 'sbom/image.cdx.json.gz'), gzipSync(JSON.stringify(completeSbom(imageDigest, sourceB))))
  })

  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [evidencePath]),
    error => {
      assert.match(error.stderr, /recorded FOSS verdict does not match fail-closed evidence/)
      return true
    },
  )

  const unknownReport = structuredClone(report)
  unknownReport.candidates[0].runtimeComponents[0].sourceCommit = sourceA
  unknownReport.candidates[0].sbomEvidence[1].sourceCommit = 'unknown'
  unknownReport.candidates[0].sbomEvidence[1].sourceCommitStatus = 'unknown'
  unknownReport.candidates[0].fossGate.passed = false
  const unknownEvidencePath = writeEvidenceFixture(unknownReport, directory => {
    const sourceSbom = completeSbom('source', null)
    sourceSbom.metadata.component.properties = [{ name: 'workshop:sourceCommit', value: sourceA }]
    writeFileSync(path.join(directory, 'sbom/source.cdx.json.gz'), gzipSync(JSON.stringify(sourceSbom)))
    writeFileSync(path.join(directory, 'sbom/image.cdx.json.gz'), gzipSync(JSON.stringify(completeSbom(imageDigest, null))))
  })
  assert.match(
    run('scripts/quiz/license-gate.mjs', [unknownEvidencePath]),
    /0 of 1 candidates passed the complete-runtime FOSS gate/,
  )
})

test('license gate rejects symlinked evidence even when its lexical path is inside the evidence root', () => {
  const evidence = path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/candidates.json')
  const report = JSON.parse(readFileSync(evidence, 'utf8'))
  report.candidates[0].sbomEvidence[0].path = 'sbom/symlink-source.cdx.json.gz'
  const evidencePath = writeEvidenceFixture(report, directory => {
    symlinkSync('claper-source.cdx.json.gz', path.join(directory, 'sbom/symlink-source.cdx.json.gz'))
  })

  assert.throws(
    () => run('scripts/quiz/license-gate.mjs', [evidencePath]),
    error => {
      assert.match(error.stderr, /symlink-source.*symlinks are not allowed/)
      return true
    },
  )
})

test('committed SBOMs identify the exact evaluated source and expose license gaps', () => {
  const evidence = JSON.parse(readFileSync(path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/candidates.json'), 'utf8'))
  for (const candidate of evidence.candidates) {
    const sbom = readGzipJson(path.join(root, `docs/decisions/evidence/0011-live-quiz-spike/sbom/${candidate.id}-source.cdx.json.gz`))
    const sourceCommit = sbom.metadata.component.properties.find(property => property.name === 'workshop:sourceCommit')
    assert.equal(sourceCommit.value, candidate.sourceCommit)
    assert.ok(sbom.components.length > 0)
    assert.ok(sbom.components.some(component => (component.licenses ?? []).length === 0))
  }

  const imageSboms = {
    claper: 'claper-image.cdx.json.gz',
    classquiz: 'classquiz-backend-image.cdx.json.gz',
    quizdock: 'quizdock-image.cdx.json.gz',
  }
  for (const candidate of evidence.candidates) {
    const sbom = readGzipJson(path.join(root, `docs/decisions/evidence/0011-live-quiz-spike/sbom/${imageSboms[candidate.id]}`))
    assert.equal(sbom.metadata.component.name, candidate.runtimeComponents[0].imageDigest)
    assert.ok(sbom.components.some(component => (component.licenses ?? []).length === 0))
  }
})

test('offline rehearsal records replayable reveal, reset, and failure-fallback evidence', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-rehearsal-'))
  const timestamp = '2026-08-04T00:00:00Z'
  run('scripts/quiz/rehearse-offline.mjs', ['--out', directory, '--timestamp', timestamp])

  const transcript = readFileSync(path.join(directory, 'transcript.md'), 'utf8')
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'))
  assert.match(transcript, new RegExp(timestamp))
  assert.match(transcript, /Scope: offline fallback only; no live service was exercised/)
  assert.match(transcript, new RegExp(`Reveal check: PASS — 0 participant answers; ${bank.questions.length} facilitator answers`))
  assert.match(transcript, /Reset check: PASS — repeated export produced identical SHA-256 outputs/)
  assert.match(transcript, /Failure fallback: PASS — participant and facilitator files remain readable without an audience service/)
  assert.match(transcript, /Input SHA-256: `[0-9a-f]{64}`/)

  const first = transcript
  run('scripts/quiz/rehearse-offline.mjs', ['--out', directory, '--timestamp', timestamp])
  assert.equal(readFileSync(path.join(directory, 'transcript.md'), 'utf8'), first)
})

test('CI enforces quiz schema, license, and rehearsal contracts', () => {
  const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
  assert.match(workflow, /pnpm run quiz:validate/)
  assert.match(workflow, /pnpm run quiz:license-gate/)
  assert.match(workflow, /pnpm run test:quiz/)
})

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { gunzipSync } from 'node:zlib'

const root = path.resolve(import.meta.dirname, '../..')
const questionsPath = path.join(root, 'quiz/questions.prototype.json')

function readGzipJson(file) {
  return JSON.parse(gunzipSync(readFileSync(file), { encoding: 'utf8' }))
}

function run(script, args = []) {
  return execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
  })
}

test('prototype bank validates three stable section and question IDs', () => {
  const output = run('scripts/quiz/validate.mjs')
  assert.match(output, /3 questions across 3 sections/)
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
      assert.match(error.stderr, /difficulty must be one of/)
      assert.match(error.stderr, /unsupported field/)
      assert.match(error.stderr, /unknown section S99/)
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
  for (const candidate of Object.values(preview)) {
    assert.equal(candidate.productionReady, false)
    assert.deepEqual(candidate.questionIds, ['S05-Q-SPK-01', 'S07-Q-SPK-01', 'S09-Q-SPK-01'])
  }
})

test('license gate fails closed for forbidden, unknown, and unpinned runtime evidence', () => {
  const evidence = path.join(root, 'docs/decisions/evidence/0011-live-quiz-spike/candidates.json')
  const output = run('scripts/quiz/license-gate.mjs', [evidence])
  assert.match(output, /0 of 3 candidates passed the complete-runtime FOSS gate/)

  const candidates = JSON.parse(readFileSync(evidence, 'utf8'))
  candidates.candidates[0].runtimeComponents[0].license = 'BUSL-1.1'
  candidates.candidates[0].fossGate.passed = true
  const directory = mkdtempSync(path.join(tmpdir(), 'quiz-license-'))
  const invalidPath = path.join(directory, 'invalid.json')
  writeFileSync(invalidPath, JSON.stringify(candidates))
  assert.throws(() => run('scripts/quiz/license-gate.mjs', [invalidPath]), /Command failed/)

  const unresolved = JSON.parse(readFileSync(evidence, 'utf8'))
  unresolved.candidates[1].dependencyLicenseCoverage = 'complete'
  unresolved.candidates[1].fossGate.passed = true
  const unresolvedPath = path.join(directory, 'unresolved.json')
  writeFileSync(unresolvedPath, JSON.stringify(unresolved))
  assert.throws(() => run('scripts/quiz/license-gate.mjs', [unresolvedPath]), /Command failed/)
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

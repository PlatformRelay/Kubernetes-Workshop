import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const outFlag = process.argv.indexOf('--out')
const timestampFlag = process.argv.indexOf('--timestamp')
if (outFlag < 0 || !process.argv[outFlag + 1] || timestampFlag < 0 || !process.argv[timestampFlag + 1]) {
  throw new Error('usage: rehearse-offline.mjs --out DIRECTORY --timestamp ISO-8601')
}
const outputDirectory = path.resolve(process.argv[outFlag + 1])
const timestamp = process.argv[timestampFlag + 1]
if (Number.isNaN(Date.parse(timestamp))) throw new Error('timestamp must be ISO-8601')
mkdirSync(outputDirectory, { recursive: true })

function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

function execute(script, args = []) {
  return execFileSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: 'utf8',
  }).replaceAll(outputDirectory, '<OUT>').trim()
}

const input = readFileSync(path.join(root, 'quiz/questions.json'))
const validateOutput = execute('scripts/quiz/validate.mjs', ['quiz/questions.json'])
const firstExportOutput = execute('scripts/quiz/export.mjs', ['--out', outputDirectory])
const generatedFiles = ['adapter-preview.json', 'facilitator.md', 'participant.md']
const firstHashes = Object.fromEntries(generatedFiles.map(file => [
  file,
  sha256(readFileSync(path.join(outputDirectory, file))),
]))

const participant = readFileSync(path.join(outputDirectory, 'participant.md'), 'utf8')
const facilitator = readFileSync(path.join(outputDirectory, 'facilitator.md'), 'utf8')
const participantAnswers = (participant.match(/^Answer:/gm) ?? []).length
const facilitatorAnswers = (facilitator.match(/^Answer:/gm) ?? []).length

const resetOutput = execute('scripts/quiz/export.mjs', ['--out', outputDirectory])
const resetHashes = Object.fromEntries(generatedFiles.map(file => [
  file,
  sha256(readFileSync(path.join(outputDirectory, file))),
]))
const resetPassed = JSON.stringify(firstHashes) === JSON.stringify(resetHashes)
const expectedAnswers = JSON.parse(input.toString('utf8')).questions.length
const fallbackPassed = participant.length > 0 && facilitator.length > 0 && participantAnswers === 0 && facilitatorAnswers === expectedAnswers

if (!resetPassed || !fallbackPassed) throw new Error('offline rehearsal assertions failed')

const hashes = generatedFiles.map(file => `- \`${file}\`: \`${firstHashes[file]}\``).join('\n')
const transcript = `# Offline quiz rehearsal transcript

- Recorded at: ${timestamp}
- Scope: offline fallback only; no live service was exercised
- Input: \`quiz/questions.json\`
- Input SHA-256: \`${sha256(input)}\`
- Runner: \`node ${process.version}\`

## Command transcript

\`\`\`text
$ node scripts/quiz/validate.mjs quiz/questions.json
${validateOutput}
$ node scripts/quiz/export.mjs --out <OUT>
${firstExportOutput}
$ node scripts/quiz/export.mjs --out <OUT>  # reset/replay
${resetOutput}
\`\`\`

## Generated output hashes

${hashes}

## Observations

- Reveal check: PASS — ${participantAnswers} participant answers; ${facilitatorAnswers} facilitator answers.
- Reset check: PASS — repeated export produced identical SHA-256 outputs.
- Failure fallback: PASS — participant and facilitator files remain readable without an audience service.
- The reset check proves deterministic offline regeneration only. It does not prove live cohort reset,
  network recovery, presenter controls, or audience-service behavior.

## Replay

Run the same command with this timestamp to reproduce the transcript and output hashes:

\`\`\`sh
node scripts/quiz/rehearse-offline.mjs \\
  --out docs/decisions/evidence/0011-live-quiz-spike/rehearsal \\
  --timestamp ${timestamp}
\`\`\`
`
writeFileSync(path.join(outputDirectory, 'transcript.md'), transcript)
process.stdout.write(`Recorded offline rehearsal in ${outputDirectory}.\n`)

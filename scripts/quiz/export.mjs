import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildPlayer } from './build-player.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const outFlag = process.argv.indexOf('--out')
if (outFlag < 0 || !process.argv[outFlag + 1]) throw new Error('usage: export.mjs --out DIRECTORY')
const outputDirectory = path.resolve(process.argv[outFlag + 1])
const bank = JSON.parse(readFileSync(path.join(root, 'quiz/questions.json'), 'utf8'))
mkdirSync(outputDirectory, { recursive: true })

function renderQuestion(question, reveal) {
  const options = question.options.map(option => `- [ ] **${option.id}** — ${option.text}`).join('\n')
  const answer = reveal
    ? `\n\nAnswer: **${question.answer}**\n\n${question.explanation}\n\n${question.options.map(option => `- **${option.id}:** ${option.rationale}`).join('\n')}`
    : ''
  return `## ${question.section} · ${question.id}\n\n${question.prompt}\n\n${options}${answer}`
}

const header = '# Workshop quiz\n\nGenerated from `quiz/questions.json`; the repository remains the source of truth.'
writeFileSync(path.join(outputDirectory, 'participant.md'), `${header}\n\n${bank.questions.map(question => renderQuestion(question, false)).join('\n\n---\n\n')}\n`)
writeFileSync(path.join(outputDirectory, 'facilitator.md'), `${header}\n\n${bank.questions.map(question => renderQuestion(question, true)).join('\n\n---\n\n')}\n`)

const questionIds = bank.questions.map(question => question.id)
const preview = {
  claper: {
    importMode: 'manual',
    productionReady: false,
    questionIds,
    note: 'No stable documented bulk question-import API was found at the evaluated source commit.',
  },
  classquiz: {
    importMode: 'authenticated-native-export-shape',
    productionReady: false,
    questionIds,
    note: 'The native import endpoint requires an authenticated user and its own versioned archive shape.',
  },
  quizdock: {
    importMode: 'authenticated-rest-api',
    productionReady: false,
    questionIds,
    note: 'OpenAPI exposes quiz and question creation, but authentication and semantic mapping still need an integration test.',
  },
}
writeFileSync(path.join(outputDirectory, 'adapter-preview.json'), `${JSON.stringify(preview, null, 2)}\n`)

// The static self-check player ships beside the Markdown copies rather than
// replacing them: the browser player needs a host to serve it, the Markdown does
// not. The stdout line below is deliberately unchanged — the committed ADR-0011
// rehearsal transcript quotes it verbatim.
buildPlayer({ outDir: path.join(outputDirectory, 'player') })

process.stdout.write(`Exported offline participant/facilitator copies and adapter preview to ${outputDirectory}.\n`)

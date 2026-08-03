import { readFileSync } from 'node:fs'
import path from 'node:path'
import { sections as deckSections } from '../deck-manifest.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const bankPath = path.resolve(process.argv[2] ?? path.join(root, 'quiz/questions.prototype.json'))
const bank = JSON.parse(readFileSync(bankPath, 'utf8'))
const errors = []
const ids = new Set()
const sections = new Set()
const canonicalSections = new Set(deckSections.map(section => section.id))
const allowedQuestionFields = new Set([
  'id', 'section', 'prompt', 'options', 'answer', 'explanation', 'difficulty', 'learningObjective', 'references',
])
const allowedOptionFields = new Set(['id', 'text', 'rationale'])

for (const field of Object.keys(bank)) {
  if (!['$schema', 'schemaVersion', 'questions'].includes(field)) errors.push(`bank: unsupported field ${field}`)
}

if (bank.schemaVersion !== 1 || !Array.isArray(bank.questions)) {
  errors.push('schemaVersion must be 1 and questions must be an array')
}

for (const [index, question] of (bank.questions ?? []).entries()) {
  const label = question.id ?? `question[${index}]`
  if (!/^S\d{2}-Q-[A-Z0-9-]+$/.test(question.id ?? '')) errors.push(`${label}: invalid question id`)
  if (ids.has(question.id)) errors.push(`${label}: duplicate question id`)
  ids.add(question.id)
  if (!/^S\d{2}$/.test(question.section ?? '') || !question.id?.startsWith(`${question.section}-`)) {
    errors.push(`${label}: section must match the question id`)
  }
  if (!canonicalSections.has(question.section)) errors.push(`${label}: unknown section ${question.section}`)
  for (const field of Object.keys(question)) {
    if (!allowedQuestionFields.has(field)) errors.push(`${label}: unsupported field ${field}`)
  }
  sections.add(question.section)
  if (!question.prompt || !question.explanation || !question.learningObjective) errors.push(`${label}: missing teaching text`)
  if (!['introductory', 'intermediate', 'advanced'].includes(question.difficulty)) {
    errors.push(`${label}: difficulty must be one of introductory, intermediate, advanced`)
  }
  if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 5) {
    errors.push(`${label}: options must contain 3 to 5 entries`)
    continue
  }
  const optionIds = question.options.map(option => option.id)
  if (new Set(optionIds).size !== optionIds.length) errors.push(`${label}: duplicate option id`)
  for (const option of question.options) {
    for (const field of Object.keys(option)) {
      if (!allowedOptionFields.has(field)) errors.push(`${label}/${option.id ?? 'option'}: unsupported field ${field}`)
    }
  }
  if (optionIds.filter(id => id === question.answer).length !== 1) {
    errors.push(`${label}: answer must name exactly one option`)
  }
  if (question.options.some(option => !option.text || !option.rationale)) errors.push(`${label}: every option needs text and rationale`)
  if (!Array.isArray(question.references) || question.references.some(reference => !/^https:\/\//.test(reference))) {
    errors.push(`${label}: references must be HTTPS URLs`)
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`Validated ${ids.size} questions across ${sections.size} sections.\n`)

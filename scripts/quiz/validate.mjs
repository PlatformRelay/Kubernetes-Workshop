import { readFileSync } from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { sections as deckSections } from '../deck-manifest.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const bankPath = path.resolve(process.argv[2] ?? path.join(root, 'quiz/questions.prototype.json'))
const bank = JSON.parse(readFileSync(bankPath, 'utf8'))
const schema = JSON.parse(readFileSync(path.join(root, 'quiz/questions.schema.json'), 'utf8'))
const errors = []
const ids = new Set()
const sections = new Set()
const canonicalSections = new Set(deckSections.map(section => section.id))
const ajv = new Ajv2020({ allErrors: true, strict: true })
const validateSchema = ajv.compile(schema)

if (!validateSchema(bank)) {
  errors.push(...validateSchema.errors.map(error =>
    `schema ${error.instancePath || '/'} ${error.message}`,
  ))
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
  sections.add(question.section)
  if (!Array.isArray(question.options) || question.options.length < 3 || question.options.length > 5) {
    continue
  }
  const optionIds = question.options.map(option => option.id)
  if (new Set(optionIds).size !== optionIds.length) errors.push(`${label}: duplicate option id`)
  if (optionIds.filter(id => id === question.answer).length !== 1) {
    errors.push(`${label}: answer must name exactly one option`)
  }
}

if (errors.length) {
  process.stderr.write(`${errors.join('\n')}\n`)
  process.exit(1)
}

process.stdout.write(`Validated ${ids.size} questions across ${sections.size} sections.\n`)

const DAY_VALUES = new Set(['1', '2', '3', 'optional'])

export function parseSelection(args) {
  let selection
  let action = 'dev'
  let list = false
  let dryRun = false
  let help = false

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--') continue
    if (arg === '--day') {
      const value = args[++i]
      if (!DAY_VALUES.has(value))
        throw new Error(`Invalid day ${value ?? '(missing)'}; use 1, 2, 3, or optional`)
      selection = setOnce(selection, { type: 'day', value })
    } else if (arg === '--section') {
      selection = setOnce(selection, { type: 'section', value: normalizeId(args[++i]) })
    } else if (arg === '--range') {
      selection = setOnce(selection, { type: 'range', value: args[++i] ?? '' })
    } else if (arg === '--action') {
      action = args[++i]
      if (!['dev', 'build', 'export'].includes(action))
        throw new Error(`Invalid action ${action ?? '(missing)'}; use dev, build, or export`)
    } else if (arg === '--list') list = true
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--help' || arg === '-h') help = true
    else throw new Error(`Unknown option ${arg}`)
  }
  return { ...selection, action, list, dryRun, help }
}

export function resolveSelection(args, { isTTY = Boolean(process.stdin.isTTY), hasGum = false } = {}) {
  const parsed = parseSelection(args)
  if (parsed.list || parsed.help || parsed.type)
    return parsed
  if (isTTY && hasGum)
    return { type: 'interactive', action: parsed.action, dryRun: parsed.dryRun }
  throw new Error('Choose a deck with --day, --section, or --range (use --list to inspect choices).')
}

export function selectSections(sections, selection) {
  if (selection.type === 'day') {
    return selection.value === 'optional'
      ? sections.filter((section) => !section.canonical)
      : sections.filter((section) => section.day === Number(selection.value) && section.canonical)
  }
  if (selection.type === 'section') {
    const found = sections.find((section) => section.id === selection.value)
    if (!found)
      throw new Error(`Unknown section ${selection.value}`)
    return [found]
  }
  if (selection.type === 'range') {
    const match = /^\s*(S\d{2})\s*-\s*(S\d{2})\s*$/i.exec(selection.value)
    if (!match)
      throw new Error(`Invalid range ${selection.value}; use S05-S09`)
    const first = sections.findIndex((section) => section.id === match[1].toUpperCase())
    const last = sections.findIndex((section) => section.id === match[2].toUpperCase())
    if (first < 0 || last < 0 || first > last)
      throw new Error(`Invalid range ${selection.value}; endpoints must exist in ascending order`)
    return sections.slice(first, last + 1)
  }
  throw new Error('No deck selection was supplied')
}

function setOnce(current, next) {
  if (current)
    throw new Error('Choose exactly one of --day, --section, or --range')
  return next
}

function normalizeId(value) {
  if (!value)
    throw new Error('Missing section ID')
  return value.toUpperCase()
}

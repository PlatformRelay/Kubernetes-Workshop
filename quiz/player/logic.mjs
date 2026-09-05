// Pure logic for the static self-check quiz player.
//
// Everything here is a value transformation: no DOM, no network, no storage, no
// clock. That is deliberate — `node --test` imports this module and drives the
// real learner journey (grading, deep links, session walk) without a browser,
// and the DOM wiring in `app.mjs` stays thin enough to read in one sitting.
//
// This player is a SELF-CHECK, not an exam. Answers, explanations, and
// distractor rationales ship in the static files next to this module; anyone can
// read them. Nothing here should ever pretend otherwise.

const SECTION_ID = /^S\d{2}$/

/**
 * Read a `#S05`-style deep link. Returns a canonical section id, or `null` when
 * the hash names no section (empty, `#`, or free text).
 */
export function parseSectionHash(hash) {
  if (typeof hash !== 'string') return null
  const raw = hash.trim().replace(/^#/, '').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!raw) return null
  const candidate = raw.toUpperCase()
  return SECTION_ID.test(candidate) ? candidate : null
}

/** Questions belonging to one section, in bank order. */
export function questionsForSection(questions, sectionId) {
  return (questions ?? []).filter(question => question.section === sectionId)
}

function countBySection(questions) {
  const counts = new Map()
  for (const question of questions ?? [])
    counts.set(question.section, (counts.get(question.section) ?? 0) + 1)
  return counts
}

/**
 * The landing page: authored sections that actually have questions, grouped by
 * workshop day, titled from the deck manifest. Deferred sections (S24) and any
 * section the bank does not cover are left out rather than offered as a dead end.
 */
export function groupSectionsByDay(sections, questions) {
  const counts = countBySection(questions)
  const groups = new Map()
  for (const section of sections ?? []) {
    if (section.status !== 'authored') continue
    const count = counts.get(section.id) ?? 0
    if (count === 0) continue
    const day = section.day
    if (!groups.has(day)) groups.set(day, [])
    groups.get(day).push({ id: section.id, title: section.title, day, count })
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left - right)
    .map(([day, entries]) => ({
      day,
      sections: entries.sort((left, right) => left.id.localeCompare(right.id)),
    }))
}

/**
 * Decide what a given hash should show. The landing page is ALWAYS computed, so
 * a hash that names nothing playable — `#S24` (deferred), an unknown id, or
 * free text — degrades to the section list with an explanation instead of
 * hiding both views and leaving a blank page.
 */
export function resolveView({ hash, sections, questions }) {
  const days = groupSectionsByDay(sections, questions)
  const landing = (notice = null) => ({
    view: 'landing',
    sectionId: null,
    section: null,
    questions: [],
    days,
    notice,
  })

  const requested = parseSectionHash(hash)
  if (!requested) {
    const stray = typeof hash === 'string' ? hash.trim().replace(/^#/, '') : ''
    return landing(stray ? `“${stray}” is not a section link — pick a section below.` : null)
  }

  const section = (sections ?? []).find(candidate => candidate.id === requested) ?? null
  if (!section)
    return landing(`${requested} is not a section of this workshop — pick a section below.`)

  const sectionQuestions = questionsForSection(questions, requested)
  if (section.status !== 'authored' || sectionQuestions.length === 0) {
    const reason = section.status === 'authored'
      ? 'has no questions in the bank yet'
      : `is ${section.status} and has no questions yet`
    return landing(`${section.id} — ${section.title} ${reason}. Pick another section below.`)
  }

  return {
    view: 'section',
    sectionId: section.id,
    section,
    questions: sectionQuestions,
    days,
    notice: null,
  }
}

/**
 * Grade one choice. Always carries the explanation; adds the chosen option's
 * rationale only when the learner got it wrong, because that is the moment the
 * "why was this tempting?" answer is worth reading.
 */
export function grade(question, optionId) {
  if (!question || !Array.isArray(question.options))
    throw new TypeError('grade() needs a question with an options array')
  const chosen = question.options.find(option => option.id === optionId)
  if (!chosen)
    throw new RangeError(`unknown option "${optionId}" for question ${question.id}`)

  const correct = optionId === question.answer
  return {
    questionId: question.id,
    chosenId: optionId,
    answerId: question.answer,
    correct,
    explanation: question.explanation,
    chosenRationale: correct ? null : chosen.rationale,
    rationales: question.options.map(option => ({
      id: option.id,
      text: option.text,
      rationale: option.rationale,
      isAnswer: option.id === question.answer,
      isChosen: option.id === optionId,
    })),
  }
}

/**
 * Which rationales to show under a graded question. By default only the wrong
 * pick's; "show all rationales" is an explicit opt-in.
 */
export function visibleRationales(result, showAll = false) {
  if (!result) return []
  if (showAll) return result.rationales
  return result.rationales.filter(entry => entry.isChosen && !entry.isAnswer)
}

// --- session -----------------------------------------------------------------
// Session state is a plain value held in memory for the length of one page view.
// Nothing is persisted: no browser storage, no cookie, no upload.

export function createSession(questions, sectionId = null) {
  const list = [...(questions ?? [])]
  return {
    sectionId,
    questions: list,
    index: 0,
    results: list.map(() => null),
    finished: false,
  }
}

export function currentQuestion(session) {
  return session.questions[session.index] ?? null
}

export function currentResult(session) {
  return session.results[session.index] ?? null
}

export function isLocked(session) {
  return currentResult(session) !== null
}

export function isLastQuestion(session) {
  return session.index >= session.questions.length - 1
}

/** First answer wins: a locked question keeps its verdict. */
export function recordAnswer(session, optionId) {
  if (session.finished) return session
  const question = currentQuestion(session)
  if (!question || session.results[session.index]) return session
  const results = [...session.results]
  results[session.index] = grade(question, optionId)
  return { ...session, results }
}

/**
 * Move forward. On the last question this FINISHES the session rather than
 * refusing to move — the forward control must never become a dead end.
 */
export function advance(session) {
  if (session.finished) return session
  if (isLastQuestion(session)) return { ...session, finished: true }
  return { ...session, index: session.index + 1 }
}

/** The forward control's label. Never empty, in any state. */
export function advanceLabel(session) {
  if (session.finished) return 'Back to sections'
  return isLastQuestion(session) ? 'See your score' : 'Next question'
}

export function sessionScore(session) {
  const answered = session.results.filter(Boolean)
  return {
    answered: answered.length,
    correct: answered.filter(result => result.correct).length,
    total: session.questions.length,
  }
}

export function restart(session) {
  return createSession(session.questions, session.sectionId)
}

// DOM wiring for the static self-check quiz player.
//
// Deliberately thin: every decision (grading, deep-link resolution, session
// walk) lives in `logic.mjs`, which `node --test` exercises directly. This file
// only turns those values into elements and turns clicks back into values.
//
// It exports `boot()` and only self-starts in a browser, so Node can import it
// as a load-time smoke check without a DOM.

import {
  advance,
  advanceLabel,
  createSession,
  currentQuestion,
  currentResult,
  isLocked,
  recordAnswer,
  resolveView,
  restart,
  sessionScore,
  visibleRationales,
} from './logic.mjs'

const element = id => document.getElementById(id)

const state = {
  sections: [],
  questions: [],
  session: null,
  sectionId: null,
  showAll: false,
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild)
}

function make(tag, { text, className, attributes } = {}) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  if (className) node.className = className
  for (const [name, value] of Object.entries(attributes ?? {})) node.setAttribute(name, value)
  return node
}

// --- landing -----------------------------------------------------------------

function renderLanding(view) {
  const notice = element('notice')
  notice.textContent = view.notice ?? ''
  notice.hidden = !view.notice

  const days = element('days')
  clear(days)
  for (const group of view.days) {
    days.append(make('h3', { text: `Day ${group.day}` }))
    const list = make('ul', { className: 'section-list' })
    for (const section of group.sections) {
      const link = make('a', {
        attributes: {
          href: `#${section.id}`,
          'data-testid': 'section-link',
          'data-section': section.id,
        },
      })
      link.append(make('span', { text: section.id, className: 'id' }))
      link.append(make('span', { text: section.title, className: 'title' }))
      link.append(make('span', {
        text: `${section.count} question${section.count === 1 ? '' : 's'}`,
        className: 'count',
      }))
      const item = document.createElement('li')
      item.append(link)
      list.append(item)
    }
    days.append(list)
  }

  element('landing').hidden = false
  element('quiz').hidden = true
}

// --- one question ------------------------------------------------------------

function optionState(result, optionId) {
  if (!result) return 'idle'
  if (optionId === result.answerId) return optionId === result.chosenId ? 'correct' : 'answer'
  return optionId === result.chosenId ? 'chosen' : 'other'
}

function renderOptions(question, result) {
  const list = element('options')
  clear(list)
  for (const option of question.options) {
    const button = make('button', {
      attributes: {
        type: 'button',
        'data-testid': 'option',
        'data-option': option.id,
        'data-state': optionState(result, option.id),
      },
    })
    button.append(make('span', { text: option.text }))
    if (result) {
      const marker = option.id === result.answerId
        ? 'Correct answer'
        : option.id === result.chosenId ? 'Your answer' : ''
      if (marker) button.append(make('span', { text: marker, className: 'marker' }))
      button.setAttribute('aria-disabled', 'true')
    }
    // A locked question ignores further clicks in `recordAnswer`; the button stays
    // focusable and clickable so keyboard users never hit a disabled dead end.
    button.addEventListener('click', () => answer(option.id))
    const item = document.createElement('li')
    item.append(button)
    list.append(item)
  }
}

function renderFeedback(question, result) {
  const panel = element('feedback')
  clear(panel)
  if (!result) {
    panel.hidden = true
    panel.removeAttribute('data-correct')
    return
  }

  panel.hidden = false
  panel.setAttribute('data-correct', String(result.correct))
  panel.append(make('p', {
    text: result.correct ? 'Correct.' : 'Not quite.',
    className: 'verdict',
  }))
  panel.append(make('p', { text: result.explanation }))

  const rationales = visibleRationales(result, state.showAll)
  if (rationales.length) {
    const list = document.createElement('ul')
    for (const entry of rationales) {
      const item = document.createElement('li')
      const label = entry.isAnswer ? 'Correct answer' : entry.isChosen ? 'Your answer' : 'Other option'
      item.append(make('strong', { text: `${label} — ${entry.text} ` }))
      item.append(document.createTextNode(entry.rationale))
      list.append(item)
    }
    panel.append(list)
  }

  const references = question.references ?? []
  if (references.length) {
    const refs = make('p', { className: 'refs' })
    refs.append(document.createTextNode('Reference: '))
    references.forEach((reference, index) => {
      if (index > 0) refs.append(document.createTextNode(' · '))
      refs.append(make('a', {
        text: reference,
        attributes: { href: reference, rel: 'noopener noreferrer', target: '_blank' },
      }))
    })
    panel.append(refs)
  }
}

function renderSession() {
  const session = state.session
  element('landing').hidden = true
  element('quiz').hidden = false
  element('quiz-heading').textContent = `${session.sectionId} · ${sectionTitle(session.sectionId)}`

  if (session.finished) {
    element('question-view').hidden = true
    element('summary').hidden = false
    const score = sessionScore(session)
    element('score').textContent =
      `You got ${score.correct} out of ${score.total} — ${score.answered} answered, `
      + `${score.total - score.answered} skipped. Nothing was recorded.`
    return
  }

  element('summary').hidden = true
  element('question-view').hidden = false

  const question = currentQuestion(session)
  const result = currentResult(session)
  element('progress').textContent =
    `Question ${session.index + 1} of ${session.questions.length}`
  element('prompt').textContent = question.prompt
  renderOptions(question, result)
  renderFeedback(question, result)
  const forward = element('advance')
  forward.textContent = advanceLabel(session)
  // Never disabled: the last question must always lead somewhere (a skipped
  // question is still a way out, not a dead end).
  forward.disabled = false
}

function sectionTitle(sectionId) {
  return state.sections.find(section => section.id === sectionId)?.title ?? sectionId
}

// --- events ------------------------------------------------------------------

function answer(optionId) {
  if (!state.session || state.session.finished) return
  if (isLocked(state.session)) return
  state.session = recordAnswer(state.session, optionId)
  renderSession()
}

function goForward() {
  if (!state.session) return
  if (state.session.finished) {
    toLanding()
    return
  }
  state.session = advance(state.session)
  renderSession()
}

function toLanding() {
  if (window.location.hash) {
    window.location.hash = ''
    return
  }
  render()
}

function render() {
  const view = resolveView({
    hash: window.location.hash,
    sections: state.sections,
    questions: state.questions,
  })

  if (view.view === 'landing') {
    state.session = null
    state.sectionId = null
    renderLanding(view)
    return
  }

  if (state.sectionId !== view.sectionId) {
    state.sectionId = view.sectionId
    state.session = createSession(view.questions, view.sectionId)
  }
  renderSession()
}

async function load(name) {
  const response = await fetch(new URL(name, import.meta.url))
  if (!response.ok) throw new Error(`${name} could not be loaded (${response.status})`)
  return response.json()
}

export async function boot() {
  const [bank, manifest] = await Promise.all([load('questions.json'), load('sections.json')])
  state.questions = bank.questions ?? []
  state.sections = manifest.sections ?? []

  element('boot').hidden = true
  element('advance').addEventListener('click', goForward)
  element('to-sections').addEventListener('click', toLanding)
  element('done').addEventListener('click', toLanding)
  element('again').addEventListener('click', () => {
    if (!state.session) return
    state.session = restart(state.session)
    renderSession()
  })
  element('show-all').addEventListener('change', event => {
    state.showAll = event.target.checked
    if (state.session && !state.session.finished) renderSession()
  })
  window.addEventListener('hashchange', render)
  render()
}

function reportBootFailure(error) {
  const boot = element('boot')
  if (!boot) return
  boot.hidden = false
  boot.textContent = `The question bank could not be loaded: ${error.message}`
}

if (typeof document !== 'undefined') boot().catch(reportBootFailure)

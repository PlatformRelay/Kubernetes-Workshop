# Portable question bank

This directory is the candidate-neutral source for workshop quizzes. It is not embedded in
Slidev. A live quiz host is still out of scope (US-QUIZ-3) until a FOSS runtime passes the
license gate.

Learners answer these questions in the **static self-check player** published at
<https://platformrelay.github.io/Kubernetes-Workshop/quiz/> — see
[the player](#static-self-check-player) below.

- `questions.schema.json` documents schema version 1.
- `questions.json` is the reviewed bank: at least two questions per authored section
  (canonical and optional). Deferred `S24` is excluded until that section is teachable.
- Stable question and option IDs survive export so result data can be related to curriculum content.
- Correct answers, explanations, distractor rationales, learning objectives, and currency references
  live in the repository, not in a quiz vendor's database.

Run the bank gates, the player build, and the offline fallback with:

```sh
node scripts/quiz/validate.mjs
node --test scripts/quiz/quiz.test.mjs
node scripts/quiz/license-gate.mjs docs/decisions/evidence/0011-live-quiz-spike/candidates.json
node scripts/quiz/export.mjs --out dist-quiz
node scripts/quiz/build-player.mjs --out dist-quiz/player
node scripts/quiz/rehearse-offline.mjs --out dist-quiz --timestamp 2026-08-04T00:06:23+02:00
```

## Static self-check player

`player/` is a zero-dependency browser player: plain HTML, CSS, and ES modules, with **no npm or
Python runtime dependency, no CDN script, no webfont, and no third-party origin**. It is published
at `/quiz/` on the GitHub Pages artifact, as a sibling of `/deck/`, by
`node scripts/quiz/build-player.mjs --out site/quiz` inside
[`scripts/pages-build.sh`](../scripts/pages-build.sh).

- `player/logic.mjs` holds every decision as pure functions — grading, `#SNN` deep-link resolution,
  and the session walk. `node --test` imports it and drives the real learner journey.
- `player/app.mjs` is thin DOM wiring on top of that module and nothing else.
- The build copies `questions.json` in verbatim and derives the section index (titles, day, status)
  from `scripts/deck-manifest.mjs`, so this directory stays the source of truth.

What the player does:

- Choosing an option **locks** the question, marks chosen against correct, always shows the
  `explanation`, and on a wrong pick also shows that option's `rationale` — the "why was this
  tempting?" answer a printed key cannot give you. "Show all rationales" is an explicit opt-in.
- The landing page groups **authored** sections by workshop day using the deck-manifest titles.
  Deferred `S24` is not offered, and a `#SNN` link to a section with no questions falls back to the
  landing page with an explanation rather than a blank screen.
- `#S05` deep-links straight into one section.

What it deliberately does not do:

- **It is not an exam and claims no exam security.** Every answer, explanation, and rationale ships
  in the static files next to the page; anyone can read them. A score is feedback for the learner
  alone, never proof of anything to anyone else, and no obfuscation will be added to pretend
  otherwise — see [ADR 0015](../docs/decisions/0015-static-self-check-quiz-player.md).
- **Nothing is stored or sent.** The score lives in the tab for as long as the tab does: no
  `localStorage`, no cookie, no account, no telemetry, no central collection. Reload and it is gone.
- **It does not show a room how it answered.** That is the live-host question, still open under
  [ADR 0011](../docs/decisions/0011-live-quiz-spike.md) and US-QUIZ-3. Facilitators keep the
  Markdown facilitator copy for a show of hands.

AJV enforces `questions.schema.json`; the validator then applies semantic relationships that JSON Schema
does not express, including known section membership, unique IDs, answer-to-option references, and a
coverage gate of at least two questions per authored section.

The export command creates separate participant and facilitator Markdown, a copy of the static
player under `player/`, plus a non-production adapter preview. Participant output deliberately omits
answers. The facilitator output can be printed or used for a show-of-hands fallback when a live
service or venue internet is unavailable; it remains the offline path and is not replaced by the
browser player.

The rehearsal command replays validation and export, records input/output hashes, checks reveal separation,
and verifies deterministic offline reset. A committed example from the US-QUIZ-1 spike lives in the ADR
evidence directory. It does not exercise or make claims about a live quiz service.

The adapter preview records what an eventual integration would need; it does not upload questions or
claim API compatibility. Claper has no stable documented bulk-import API at the evaluated commit,
ClassQuiz imports its authenticated native archive shape, and QuizDock exposes authenticated REST
creation through OpenAPI. The schema in this directory remains the source of truth regardless of the
eventual delivery adapter.

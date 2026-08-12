# Portable question bank

This directory is the candidate-neutral source for workshop quizzes. It is not embedded in
Slidev. A live quiz host is still out of scope (US-QUIZ-3) until a FOSS runtime passes the
license gate.

- `questions.schema.json` documents schema version 1.
- `questions.json` is the reviewed bank: at least two questions per authored section
  (canonical and optional). Deferred `S24` is excluded until that section is teachable.
- Stable question and option IDs survive export so result data can be related to curriculum content.
- Correct answers, explanations, distractor rationales, learning objectives, and currency references
  live in the repository, not in a quiz vendor's database.

Run the bank gates and offline fallback with:

```sh
node scripts/quiz/validate.mjs
node --test scripts/quiz/quiz.test.mjs
node scripts/quiz/license-gate.mjs docs/decisions/evidence/0011-live-quiz-spike/candidates.json
node scripts/quiz/export.mjs --out dist-quiz
node scripts/quiz/rehearse-offline.mjs --out dist-quiz --timestamp 2026-08-04T00:06:23+02:00
```

AJV enforces `questions.schema.json`; the validator then applies semantic relationships that JSON Schema
does not express, including known section membership, unique IDs, answer-to-option references, and a
coverage gate of at least two questions per authored section.

The export command creates separate participant and facilitator Markdown plus a non-production adapter
preview. Participant output deliberately omits answers. The facilitator output can be printed or used
for a show-of-hands fallback when a live service or venue internet is unavailable.

The rehearsal command replays validation and export, records input/output hashes, checks reveal separation,
and verifies deterministic offline reset. A committed example from the US-QUIZ-1 spike lives in the ADR
evidence directory. It does not exercise or make claims about a live quiz service.

The adapter preview records what an eventual integration would need; it does not upload questions or
claim API compatibility. Claper has no stable documented bulk-import API at the evaluated commit,
ClassQuiz imports its authenticated native archive shape, and QuizDock exposes authenticated REST
creation through OpenAPI. The schema in this directory remains the source of truth regardless of the
eventual delivery adapter.

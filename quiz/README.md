# Portable quiz prototype

This directory is the candidate-neutral source for the US-QUIZ-1 architecture spike. It is not a
complete question bank and is not embedded in Slidev.

- `questions.schema.json` documents schema version 1.
- `questions.prototype.json` exercises the schema across S05, S07, and S09.
- Stable question and option IDs survive export so result data can be related to curriculum content.
- Correct answers, explanations, distractor rationales, learning objectives, and currency references
  live in the repository, not in a quiz vendor's database.

Run the prototype gates and offline fallback with:

```sh
node scripts/quiz/validate.mjs
node --test scripts/quiz/quiz.test.mjs
node scripts/quiz/license-gate.mjs docs/decisions/evidence/0011-live-quiz-spike/candidates.json
node scripts/quiz/export.mjs --out dist-quiz
node scripts/quiz/rehearse-offline.mjs --out dist-quiz --timestamp 2026-08-04T00:06:23+02:00
```

AJV enforces `questions.schema.json`; the validator then applies semantic relationships that JSON Schema
does not express, including canonical section membership, unique IDs, and answer-to-option references.

The export command creates separate participant and facilitator Markdown plus a non-production adapter
preview. Participant output deliberately omits answers. The facilitator output can be printed or used
for a show-of-hands fallback when the live service or venue internet is unavailable.

The rehearsal command replays validation and export, records input/output hashes, checks reveal separation,
and verifies deterministic offline reset. A committed example lives in the ADR evidence directory. It does
not exercise or make claims about a live quiz service.

The adapter preview records what an eventual integration would need; it does not upload questions or
claim API compatibility. Claper has no stable documented bulk-import API at the evaluated commit,
ClassQuiz imports its authenticated native archive shape, and QuizDock exposes authenticated REST
creation through OpenAPI. US-QUIZ-2 must retain this schema as source of truth regardless of the eventual
delivery adapter.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { auditContractDocumentation, auditLab } from './lab-contract.mjs';

function fixture({ lab = '', solution = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lab-contract-'));
  const day = join(root, 'labs', 'day-1');
  mkdirSync(day, { recursive: true });
  const labPath = join(day, '01-example.md');
  writeFileSync(labPath, lab);
  if (solution !== null) {
    writeFileSync(join(day, '01-example.solution.md'), solution);
  }
  return labPath;
}

const validLab = `# Lab 01 — Example

<!-- lab-contract:v1 -->

## Prerequisites

- A namespace.

## Guided task

Run the example.

[Spoiler: guided solutions](./01-example.solution.md#guided-solutions)

## Observe

Observe the result.

## Challenge

Diagnose why the labelled Pod is not selected.

[Spoiler: challenge solution](./01-example.solution.md#challenge-solution)

## Verify

\`kubectl get pod -l workshop.example/lab=01 -n "$NS"\`

## Cleanup / reset

\`kubectl delete pod -l workshop.example/lab=01 -n "$NS"\`
`;

const validSolution = `# Lab 01 — Example solutions

## Guided solutions

\`kubectl run example --image=busybox:1.37 -l workshop.example/lab=01 -n "$NS"\`

## Expected state

The Pod is Running.

## Troubleshooting and recovery

Describe the Pod and inspect Events.

## Challenge solution

Fix the selector label and verify the endpoint.
`;

test('accepts a complete participant lab and sibling solution', () => {
  assert.deepEqual(auditLab(fixture({ lab: validLab, solution: validSolution })), []);
});

test('reports missing contract headings, solution file, and spoiler links', () => {
  const errors = auditLab(fixture({
    lab: '# Lab 01 — Incomplete\n\n## Prerequisites\n\n- kubectl\n',
    solution: null,
  }));

  assert.ok(errors.some((error) => error.includes('missing heading: Guided task')));
  assert.ok(errors.some((error) => error.includes('missing sibling solution')));
  assert.ok(errors.some((error) => error.includes('missing guided solution link')));
  assert.ok(errors.some((error) => error.includes('missing challenge solution link')));
});

test('rejects broad Kubernetes and host-wide destructive cleanup', () => {
  const unsafe = validLab.replace(
    '`kubectl delete pod -l workshop.example/lab=01 -n "$NS"`',
    `\`kubectl delete all --all\`

\`kubectl delete namespace workshop\`

\`rm -rf /\``,
  );
  const errors = auditLab(fixture({ lab: unsafe, solution: validSolution }));

  assert.ok(errors.some((error) => error.includes('broad kubectl delete')));
  assert.ok(errors.some((error) => error.includes('unqualified namespace deletion')));
  assert.ok(errors.some((error) => error.includes('host-wide destructive command')));
});

test('rejects cleanup placed before challenge or verification', () => {
  const misplaced = validLab
    .replace('## Challenge', '## Cleanup / reset')
    .replace('## Cleanup / reset\n\n`kubectl delete', '## Challenge\n\n`kubectl delete');
  const errors = auditLab(fixture({ lab: misplaced, solution: validSolution }));

  assert.ok(errors.some((error) => error.includes('Cleanup / reset must follow Challenge and Verify')));
});

test('rejects a dangling challenge-solution anchor', () => {
  const errors = auditLab(fixture({
    lab: validLab,
    solution: validSolution.replace('## Challenge solution', '## Challenge answer'),
  }));

  assert.ok(errors.some((error) => error.includes('dangling challenge solution link')));
});

test('keeps contributor and facilitator guidance aligned with the enforced slice', () => {
  assert.deepEqual(auditContractDocumentation(), []);
});

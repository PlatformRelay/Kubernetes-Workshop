import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditContractDocumentation,
  auditDayOneCommandTruth,
  auditLab,
} from './lab-contract.mjs';

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

**Difficulty:** Intermediate

**Success criteria:** Explain the mismatch and restore one ready endpoint.

**Hints:** Compare the Service selector with the Pod labels.

[Spoiler: challenge solution](./01-example.solution.md#challenge-solution)

## Verify

\`kubectl get pod -l workshop.example/lab=01 -n "$NS"\`

## Cleanup / reset

\`kubectl delete pod -l workshop.example/lab=01 -n "$NS"\`
`;

const validSolution = `# Lab 01 — Example solutions

## Guided solutions

\`\`\`bash
# stage: create the guided object
kubectl run example --image=busybox:1.37 -l workshop.example/lab=01 -n "$NS"
\`\`\`

## Expected state / output

The labelled Pod reaches the Running phase.

## Explanation

The label connects the Service to the Pod.

## Troubleshooting and recovery

Run \`kubectl describe pod example -n "$NS"\` and inspect Events.

## Challenge solution

### Commands / manifest

\`\`\`bash
# Terminal B:
kubectl label pod example app=example -n "$NS"
\`\`\`

### Expected state / output

One ready endpoint is present.

### Explanation

The corrected label matches the selector.

### Hints

Compare the Service selector with the Pod labels.
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

test('rejects challenges without assessable metadata or transfer work', () => {
  const weak = validLab
    .replace('**Difficulty:** Intermediate\n\n', '')
    .replace('**Success criteria:** Explain the mismatch and restore one ready endpoint.\n\n', '')
    .replace('**Hints:** Compare the Service selector with the Pod labels.\n\n', '')
    .replace('Diagnose why the labelled Pod is not selected.', 'Run the command.');
  const errors = auditLab(fixture({ lab: weak, solution: validSolution }));

  assert.ok(errors.some((error) => error.includes('missing Challenge Difficulty')));
  assert.ok(errors.some((error) => error.includes('missing Challenge Success criteria')));
  assert.ok(errors.some((error) => error.includes('missing Challenge Hints')));
  assert.ok(errors.some((error) => error.includes('must require transfer or diagnosis')));
});

test('rejects vacuous solution companions and mismatched hints', () => {
  const weakSolution = validSolution
    .replace('```bash\n# Terminal B:\nkubectl label pod example app=example -n "$NS"\n```', 'Run kubectl.')
    .replace('One ready endpoint is present.', '')
    .replace('The corrected label matches the selector.', '')
    .replace('Compare the Service selector with the Pod labels.', 'Read the docs.');
  const errors = auditLab(fixture({ lab: validLab, solution: weakSolution }));

  assert.ok(errors.some((error) => error.includes('Challenge solution needs exact commands or a manifest')));
  assert.ok(errors.some((error) => error.includes('Challenge expected state / output is empty')));
  assert.ok(errors.some((error) => error.includes('Challenge explanation is empty')));
  assert.ok(errors.some((error) => error.includes('Challenge hints do not match')));
});

test('guards the known Day 1 command regressions', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = auditDayOneCommandTruth(root);
  assert.deepEqual(errors, []);
});

test('keeps contributor and facilitator guidance aligned with the enforced slice', () => {
  assert.deepEqual(auditContractDocumentation(), []);
});

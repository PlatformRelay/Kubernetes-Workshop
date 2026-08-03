import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CONTRACTED_LABS,
  DAY_1_LABS,
  DAY_2_LABS,
  DAY_3_LABS,
  DEFERRED_LAB_EXCEPTIONS,
  auditContractDocumentation,
  auditDayOneCommandTruth,
  auditDayThreeCleanupTruth,
  auditLab,
  auditLabs,
} from './lab-contract.mjs';

function fixture({ lab = '', solution = '', name = '01-example' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'lab-contract-'));
  const day = join(root, 'labs', 'day-1');
  mkdirSync(day, { recursive: true });
  const labPath = join(day, `${name}.md`);
  writeFileSync(labPath, lab);
  if (solution !== null) {
    writeFileSync(join(day, `${name}.solution.md`), solution);
  }
  return labPath;
}

const validLab = `# Lab 01 — Example

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S01 — Example |
| **Environment** | namespace or kind |
| **Estimated time** | 10 min |

## Objective

Diagnose a Service selector mismatch and restore a reachable endpoint using observable cluster state.

## Prerequisites

- A writable namespace and a configured kubectl context for the workshop cluster.

## Files used

- \`example.yaml\` — the namespace-scoped example manifest used by this exercise.

## Guided task

Create the labelled example Pod, inspect its state, and compare its labels with the Service selector.

[Spoiler: guided solutions](./01-example.solution.md#guided-solutions)

## Observe

Observe the Pod phase, labels, and selected endpoint address before changing the mismatch.

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

The Service selects this Pod because the corrected application label matches its selector exactly.

## Troubleshooting and recovery

Restore the label with \`kubectl label pod example app=example --overwrite -n "$NS"\`.

## Challenge solution

### Commands / manifest

\`\`\`bash
# Terminal B:
kubectl label pod example app=example -n "$NS"
\`\`\`

### Expected state / output

The Service reports one ready endpoint address for the corrected Pod.

### Explanation

The endpoint appears because the corrected Pod label now matches the Service selector.

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

test('audits fenced destructive commands in the sibling solution', () => {
  const unsafeSolution = `${validSolution}

\`\`\`bash
kubectl delete all --all
rm -rf /
\`\`\`
`;
  const errors = auditLab(fixture({ lab: validLab, solution: unsafeSolution }));

  assert.ok(errors.some((error) => error.includes('.solution.md: line') && error.includes('broad kubectl delete')));
  assert.ok(errors.some((error) => error.includes('.solution.md: line') && error.includes('host-wide destructive command')));

  const scopedSolution = `${validSolution}

\`\`\`bash
kubectl delete pod example -n "$NS" --ignore-not-found
rm -f example.yaml
\`\`\`
`;
  assert.deepEqual(auditLab(fixture({ lab: validLab, solution: scopedSolution })), []);
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

test('requires the complete ordered participant lab skeleton and substantive metadata', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const lab = readFileSync(resolve(repo, 'labs/day-1/05-pod.md'), 'utf8');
  const solution = readFileSync(resolve(repo, 'labs/day-1/05-pod.solution.md'), 'utf8');
  const cases = [
    ['title', lab.replace(/^# Lab 05[^\n]*\n/, ''), 'missing lab title'],
    ['metadata', lab.replace(/^\| \*\*(?:Section|Environment|Estimated time)\*\* \|[^\n]*\n/gm, ''), 'missing metadata field'],
    ['objective', lab.replace(/^## Objective\n[\s\S]*?(?=^## Prerequisites)/m, ''), 'missing heading: Objective'],
    ['files', lab.replace(/^## Files used\n[\s\S]*?(?=^## Guided task)/m, ''), 'missing heading: Files used'],
    [
      'order',
      lab.replace('## Objective', '## TEMP').replace('## Prerequisites', '## Objective').replace('## TEMP', '## Prerequisites'),
      'lab sections must follow prescribed order',
    ],
    [
      'metadata order',
      lab.replace(
        '| **Section** | S05 — Pod *(red line 1/5)* |',
        'moved below objective',
      ).replace(
        '## Prerequisites',
        '| **Section** | S05 — Pod *(red line 1/5)* |\n\n## Prerequisites',
      ),
      'lab title, metadata, and sections must follow prescribed order',
    ],
    [
      'shallow metadata',
      lab.replace('| **Section** | S05 — Pod *(red line 1/5)* |', '| **Section** | x |'),
      'metadata field is not substantive: Section',
    ],
  ];

  for (const [name, mutated, expected] of cases) {
    const errors = auditLab(fixture({ lab: mutated, solution, name: '05-pod' }));
    assert.ok(errors.some((error) => error.includes(expected)), `${name}: missing ${expected}`);
  }
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
    .replace('The Service reports one ready endpoint address for the corrected Pod.', '')
    .replace('The endpoint appears because the corrected Pod label now matches the Service selector.', '')
    .replace('Compare the Service selector with the Pod labels.', 'Read the docs.');
  const errors = auditLab(fixture({ lab: validLab, solution: weakSolution }));

  assert.ok(errors.some((error) => error.includes('Challenge solution needs substantive commands or a manifest')));
  assert.ok(errors.some((error) => error.includes('Challenge expected state / output needs an observable result')));
  assert.ok(errors.some((error) => error.includes('Challenge explanation needs a causal account')));
  assert.ok(errors.some((error) => error.includes('Challenge hints do not match')));
});

test('rejects syntactically complete placeholder challenge and solution text', () => {
  const placeholderLab = validLab
    .replace('Diagnose why the labelled Pod is not selected.', 'Diagnose.')
    .replace('**Difficulty:** Intermediate', '**Difficulty:** x')
    .replace(
      '**Success criteria:** Explain the mismatch and restore one ready endpoint.',
      '**Success criteria:** x',
    )
    .replace('**Hints:** Compare the Service selector with the Pod labels.', '**Hints:** x');
  const placeholderSolution = validSolution
    .replace(
      '# stage: create the guided object\nkubectl run example --image=busybox:1.37 -l workshop.example/lab=01 -n "$NS"',
      'echo x',
    )
    .replace('The labelled Pod reaches the Running phase.', '`x`')
    .replace(
      'The Service selects this Pod because the corrected application label matches its selector exactly.',
      '`x`',
    )
    .replace(
      'Restore the label with `kubectl label pod example app=example --overwrite -n "$NS"`.',
      'Restore with `kubectl x`.',
    )
    .replace(
      '# Terminal B:\nkubectl label pod example app=example -n "$NS"',
      'echo x',
    )
    .replace('The Service reports one ready endpoint address for the corrected Pod.', '`x`')
    .replace(
      'The endpoint appears because the corrected Pod label now matches the Service selector.',
      '`x`',
    )
    .replace('Compare the Service selector with the Pod labels.', 'x');
  const errors = auditLab(fixture({ lab: placeholderLab, solution: placeholderSolution }));

  for (const expected of [
    'Challenge task is too shallow',
    'Challenge Difficulty must be Beginner, Intermediate, or Advanced',
    'Challenge Success criteria need an action and observable success signal',
    'Challenge Hints need actionable guidance',
    'Guided solutions need substantive commands or a manifest',
    'Expected state / output needs an observable result',
    'Explanation needs a causal account',
    'Troubleshooting needs a concrete corrective command',
    'Challenge solution needs substantive commands or a manifest',
    'Challenge expected state / output needs an observable result',
    'Challenge explanation needs a causal account',
  ]) {
    assert.ok(errors.some((error) => error.includes(expected)), `missing error: ${expected}`);
  }
});

test('guards the known Day 1 command regressions', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = auditDayOneCommandTruth(root);
  assert.deepEqual(errors, []);
});

test('rejects a colliding Lab 08 class and mandatory unpinned translation', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const root = mkdtempSync(join(tmpdir(), 'lab-command-truth-'));
  const day = join(root, 'labs', 'day-1');
  mkdirSync(day, { recursive: true });
  for (const name of [
    '02-container-security.md',
    '07-service.md',
    '07-service.solution.md',
    '08-ingress.md',
  ]) {
    const source = readFileSync(resolve(repo, 'labs', 'day-1', name), 'utf8');
    const content = name === '08-ingress.md'
      ? source
        .replace(
          'export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"',
          'export INGRESS_CLASS=contour',
        )
        .replace('grep -Fx -- "--ingress-class-name=$INGRESS_CLASS"', 'grep contour')
        .replace(
          '\\"value\\":\\"--ingress-class-name=$INGRESS_CLASS\\"',
          '\\"value\\":\\"--ingress-class-name=contour\\"',
        )
        .replace('kubectl get ingressclass "$INGRESS_CLASS" >/dev/null', 'true')
        .replace(
          'report the returned application version, and explain why TLS needs SNI rather than only an\nHTTP Host header.',
          'translate the Ingress and identify one Gateway plus two HTTPRoutes.',
        )
        .replace('not part of the challenge success criteria or verification', 'part of verification')
      : source;
    writeFileSync(join(day, name), content);
  }

  const errors = auditDayOneCommandTruth(root);
  assert.ok(errors.some((error) => error.includes('collision-safe class isolation')));
  assert.ok(errors.some((error) => error.includes('must not be mandatory')));
  assert.ok(errors.some((error) => error.includes('clearly optional')));
});

test('keeps contributor and facilitator guidance aligned with the enforced slice', () => {
  assert.deepEqual(auditContractDocumentation(), []);
});

test('inventories Day 1–3 participant labs in the enforced contract (S24 deferred)', () => {
  assert.deepEqual(DAY_1_LABS, [
    'labs/day-1/01-containers.md',
    'labs/day-1/02-container-security.md',
    'labs/day-1/03-cluster-tour.md',
    'labs/day-1/04-kubectl.md',
    'labs/day-1/05-pod.md',
    'labs/day-1/06-deployment.md',
    'labs/day-1/07-service.md',
    'labs/day-1/08-ingress.md',
  ]);
  assert.deepEqual(DAY_2_LABS, [
    'labs/day-2/09-gateway-api.md',
    'labs/day-2/10-config.md',
    'labs/day-2/11-storage.md',
    'labs/day-2/12-statefulset.md',
    'labs/day-2/13-resources.md',
    'labs/day-2/14-probes.md',
    'labs/day-2/15-jobs.md',
    'labs/day-2/16-hpa.md',
  ]);
  assert.deepEqual(DAY_3_LABS, [
    'labs/day-3/17-pod-security.md',
    'labs/day-3/18-networkpolicy.md',
    'labs/day-3/19-rbac.md',
    'labs/day-3/20-helm.md',
    'labs/day-3/21-gitops.md',
    'labs/day-3/22-operator-concept.md',
    'labs/day-3/23-prometheus.md',
    'labs/day-3/25-pod-escape.md',
    'labs/day-3/26-capstone.md',
  ]);
  assert.deepEqual(DEFERRED_LAB_EXCEPTIONS, [
    {
      path: 'labs/day-3/24-kubebuilder.md',
      reason: 'S24 kubebuilder is a deferred stub; sibling-solution contract waits on toolchain authoring',
    },
  ]);
  assert.ok(!DAY_3_LABS.includes('labs/day-3/24-kubebuilder.md'));
  assert.ok(!CONTRACTED_LABS.includes('labs/day-3/24-kubebuilder.md'));
  assert.deepEqual(CONTRACTED_LABS, [...DAY_1_LABS, ...DAY_2_LABS, ...DAY_3_LABS]);
  assert.equal(CONTRACTED_LABS.length, 25);
});

test('audits every Day 2 participant lab against the sibling-solution contract', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = auditLabs(DAY_2_LABS.map((path) => resolve(repo, path)));
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('audits every Day 3 contracted lab against the sibling-solution contract', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = auditLabs(DAY_3_LABS.map((path) => resolve(repo, path)));
  assert.deepEqual(errors, [], errors.join('\n'));
});

test('rejects Day 3 cleanup prose that fakes namespace deletes or splits them', () => {
  const root = mkdtempSync(join(tmpdir(), 'lab-day3-cleanup-'));
  const day = join(root, 'labs', 'day-3');
  mkdirSync(day, { recursive: true });
  for (const name of DAY_3_LABS.map((path) => path.split('/').at(-1))) {
    writeFileSync(join(day, name), '# ok\n');
    writeFileSync(join(day, name.replace(/\.md$/, '.solution.md')), '# ok\n');
  }
  writeFileSync(join(day, '24-kubebuilder.md'), '# deferred stub\n');
  writeFileSync(
    join(day, '26-capstone.md'),
    '> `remove the lab Namespace object (kind: burn the cluster)` removes everything\n',
  );
  writeFileSync(
    join(day, '25-pod-escape.solution.md'),
    'tear it down:\n`./context-check.sh && remove the lab Namespace out-of-band / burn kind\n',
  );
  writeFileSync(
    join(day, '26-capstone.solution.md'),
    'Clean up: `kubectl delete\nnamespace s26-warn`.\n',
  );
  writeFileSync(join(day, '99-orphan.md'), '# not contracted\n');

  const errors = auditDayThreeCleanupTruth(root);
  assert.ok(errors.some((error) => error.includes('nonsensical Namespace-object')));
  assert.ok(errors.some((error) => error.includes('unclosed code span')));
  assert.ok(errors.some((error) => error.includes('line-split to bypass unsafeCommands')));
  assert.ok(errors.some((error) => error.includes('99-orphan.md') && error.includes('DEFERRED_LAB_EXCEPTIONS')));
});

test('guards Day 3 cleanup / panic-reset wording on contracted labs', () => {
  const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  assert.deepEqual(auditDayThreeCleanupTruth(repo), []);
});

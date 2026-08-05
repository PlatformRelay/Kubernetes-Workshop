import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATION_TIERS,
  INVENTORY_PATH,
  buildInventory,
  classifyAutomationTier,
  mapDeliveryLabs,
  parseMatrixRows,
  renderInventory,
  selectLabs,
} from './lab-inventory.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');

const FIXTURE_MATRIX = `# Clean-environment lab validation matrix

## The matrix

| Lab | Section | Environment | Add-ons | Pinned versions / URLs | State |
| --- | --- | --- | --- | --- | --- |
| [\`day-1/01-containers.md\`](../labs/day-1/01-containers.md) | S01 Containers | local — no cluster | None | local demo | \`unrun\` |
| [\`day-1/05-pod.md\`](../labs/day-1/05-pod.md) | S05 Pod | namespace ✓ / kind ✓ | None | workshop-web | \`unrun\` |
| [\`day-1/08-ingress.md\`](../labs/day-1/08-ingress.md) | S08 Ingress | namespace ✓ / kind ✓ | **Ingress controller (Contour)** | Contour | \`unrun\` |
| [\`day-2/09-gateway-api.md\`](../labs/day-2/09-gateway-api.md) | S09 Gateway API | namespace ✓ / kind ✓ | **Gateway API + Envoy Gateway** | EG | \`unrun\` |
| [\`day-3/24-kubebuilder.md\`](../labs/day-3/24-kubebuilder.md) | S24 Operator | kind-only · advanced | **kubebuilder** | none | \`deferred\` |
`;

function fixtureRepo() {
  const root = mkdtempSync(join(tmpdir(), 'lab-inventory-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  mkdirSync(join(root, 'labs', 'day-1'), { recursive: true });
  writeFileSync(join(root, 'docs', 'validation-matrix.md'), FIXTURE_MATRIX);
  writeFileSync(
    join(root, 'labs', 'day-1', '05-pod.md'),
    `# Lab 05

| | |
| --- | --- |
| **Section** | S05 — Pod |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 25 min |

## Cleanup / reset

\`\`\`bash
kubectl delete pod web web-typo crash -n "$NS" --ignore-not-found
\`\`\`
`,
  );
  writeFileSync(
    join(root, 'labs', 'day-1', '01-containers.md'),
    `# Lab 01

| | |
| --- | --- |
| **Estimated time** | 25 min |

## Cleanup / reset

\`\`\`bash
docker rm -f demo
\`\`\`
`,
  );
  writeFileSync(
    join(root, 'labs', 'day-1', '08-ingress.md'),
    `# Lab 08

| | |
| --- | --- |
| **Estimated time** | 25 min |

## Cleanup / reset

\`\`\`bash
kubectl delete -f ingress.yaml -f backends.yaml -n "$NS" --ignore-not-found
\`\`\`
`,
  );
  mkdirSync(join(root, 'labs', 'day-2'), { recursive: true });
  writeFileSync(
    join(root, 'labs', 'day-2', '09-gateway-api.md'),
    `# Lab 09

| | |
| --- | --- |
| **Estimated time** | 25 min |

## Cleanup / reset

\`\`\`bash
kubectl delete -f gateway.yaml -n "$NS" --ignore-not-found
\`\`\`
`,
  );
  mkdirSync(join(root, 'labs', 'day-3'), { recursive: true });
  writeFileSync(
    join(root, 'labs', 'day-3', '24-kubebuilder.md'),
    `# Lab 24

| | |
| --- | --- |
| **Estimated time** | 40 min |

## Cleanup / reset

Deferred stub.
`,
  );
  return root;
}

test('parseMatrixRows reads every lab row from the matrix table', () => {
  const rows = parseMatrixRows(FIXTURE_MATRIX);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].labPath, 'labs/day-1/01-containers.md');
  assert.equal(rows[1].section, 'S05');
  assert.equal(rows[2].addons, '**Ingress controller (Contour)**');
  assert.equal(rows[4].validationState, 'deferred');
});

test('classifyAutomationTier cover local, cluster, addon, and deferred', () => {
  assert.ok(AUTOMATION_TIERS.includes('local-container'));
  assert.ok(AUTOMATION_TIERS.includes('kind-addon'));
  assert.equal(
    classifyAutomationTier({
      environment: 'local — no cluster',
      addons: 'None',
      validationState: 'unrun',
      labPath: 'labs/day-1/01-containers.md',
    }),
    'local-container',
  );
  assert.equal(
    classifyAutomationTier({
      environment: 'namespace ✓ / kind ✓',
      addons: 'None',
      validationState: 'unrun',
      labPath: 'labs/day-1/05-pod.md',
    }),
    'kind-cluster',
  );
  assert.equal(
    classifyAutomationTier({
      environment: 'namespace ✓ / kind ✓',
      addons: '**Ingress controller (Contour)**',
      validationState: 'unrun',
      labPath: 'labs/day-1/08-ingress.md',
    }),
    'kind-addon',
  );
  assert.equal(
    classifyAutomationTier({
      environment: 'kind-only · advanced',
      addons: '**kubebuilder toolchain**',
      validationState: 'deferred',
      labPath: 'labs/day-3/24-kubebuilder.md',
    }),
    'deferred',
  );
  assert.equal(
    classifyAutomationTier({
      environment: '**kind-only · strictly defensive** (no shared path)',
      addons: '**None** — throwaway kind cluster + `context-check.sh` guard',
      validationState: 'unrun',
      labPath: 'labs/day-3/25-pod-escape.md',
    }),
    'kind-cluster',
  );
});

test('buildInventory derives profile, privilege, duration, cleanup, and PR flags', () => {
  const root = fixtureRepo();
  const inventory = buildInventory({ repoRoot: root });
  assert.equal(inventory.sourceOfTruth, 'docs/validation-matrix.md');
  assert.equal(inventory.labs.length, 5);

  const pod = inventory.labs.find((lab) => lab.id === 'day-1/05-pod');
  assert.ok(pod);
  assert.equal(pod.automationTier, 'kind-cluster');
  assert.equal(pod.profile, null);
  assert.equal(pod.privilege, 'namespace');
  assert.equal(pod.estimatedDurationMin, 25);
  assert.match(pod.cleanupCommand, /kubectl delete pod web/);
  assert.equal(pod.prSmoke, true);
  assert.equal(pod.solutionPath, null);

  const ingress = inventory.labs.find((lab) => lab.id === 'day-1/08-ingress');
  assert.equal(ingress.automationTier, 'kind-addon');
  assert.equal(ingress.profile, 'day-1');
  assert.equal(ingress.privilege, 'cluster-admin');
  assert.equal(ingress.prSmoke, true);

  const local = inventory.labs.find((lab) => lab.id === 'day-1/01-containers');
  assert.equal(local.automationTier, 'local-container');
  assert.equal(local.prSmoke, false);

  const gateway = inventory.labs.find((lab) => lab.id === 'day-2/09-gateway-api');
  assert.equal(gateway.profile, 'day-2');
  assert.equal(gateway.prSmoke, false);
  assert.equal(gateway.scheduleSmoke, true);

  const deferred = inventory.labs.find((lab) => lab.id === 'day-3/24-kubebuilder');
  assert.equal(deferred.automationTier, 'deferred');
  assert.equal(deferred.prSmoke, false);
  assert.equal(deferred.scheduleSmoke, false);
});

test('selectLabs filters pr-day1 and schedule shards', () => {
  const root = fixtureRepo();
  const inventory = buildInventory({ repoRoot: root });
  const pr = selectLabs(inventory, 'pr-day1');
  assert.deepEqual(
    pr.map((lab) => lab.id),
    ['day-1/05-pod', 'day-1/08-ingress'],
  );
  const day2 = selectLabs(inventory, 'schedule-day2');
  assert.deepEqual(
    day2.map((lab) => lab.id),
    ['day-2/09-gateway-api'],
  );
});

test('mapDeliveryLabs keeps exactly one S21 GitOps lab variant', () => {
  const labs = [
    { labPath: 'labs/day-3/20-helm.md', section: 'S20' },
    { labPath: 'labs/day-3/21-gitops.md', section: 'S21' },
    { labPath: 'labs/day-3/21-gitops-flux.md', section: 'S21' },
    { labPath: 'labs/day-3/22-operator-concept.md', section: 'S22' },
  ];
  assert.deepEqual(
    mapDeliveryLabs(labs).map((lab) => lab.labPath),
    ['labs/day-3/20-helm.md', 'labs/day-3/21-gitops.md', 'labs/day-3/22-operator-concept.md'],
  );
  assert.deepEqual(
    mapDeliveryLabs(labs, { gitops: 'flux' }).map((lab) => lab.labPath),
    ['labs/day-3/20-helm.md', 'labs/day-3/21-gitops-flux.md', 'labs/day-3/22-operator-concept.md'],
  );
  assert.throws(() => mapDeliveryLabs(labs, { gitops: 'both' }), /argocd|flux/i);
});

test('renderInventory is stable JSON and real repo inventory covers all matrix labs', () => {
  const inventory = buildInventory({ repoRoot: REPO_ROOT });
  assert.ok(inventory.labs.length >= 25);
  const ids = inventory.labs.map((lab) => lab.id);
  assert.ok(ids.includes('day-1/00-setup'));
  assert.ok(ids.includes('day-1/05-pod'));
  assert.ok(ids.includes('day-1/08-ingress'));
  assert.ok(ids.includes('day-3/24-kubebuilder'));
  assert.ok(ids.includes('day-3/26-capstone'));

  const pod = inventory.labs.find((lab) => lab.id === 'day-1/05-pod');
  assert.equal(pod.solutionPath, 'labs/day-1/05-pod.solution.md');
  assert.equal(pod.automationTier, 'kind-cluster');
  assert.equal(pod.prSmoke, true);

  const containers = inventory.labs.find((lab) => lab.id === 'day-1/01-containers');
  assert.equal(containers.automationTier, 'local-container');
  assert.equal(containers.prSmoke, false);

  const rendered = renderInventory(inventory);
  assert.match(rendered, /"schemaVersion": 1/);
  assert.equal(rendered.endsWith('\n'), true);

  const committed = JSON.parse(readFileSync(join(REPO_ROOT, INVENTORY_PATH), 'utf8'));
  assert.deepEqual(committed, JSON.parse(rendered));
});

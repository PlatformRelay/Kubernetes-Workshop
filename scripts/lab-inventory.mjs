#!/usr/bin/env node
/**
 * Lab inventory — machine-readable view of docs/validation-matrix.md (US-ENV-4A).
 *
 * Canonical source of truth: the Markdown matrix (human-edited). This module
 * parses it, enriches rows from lab frontmatter / Cleanup sections, and writes
 * infra/lab-inventory.json. CI runs `--check` to catch drift.
 *
 * Usage:
 *   node scripts/lab-inventory.mjs              # print JSON
 *   node scripts/lab-inventory.mjs --write       # regenerate infra/lab-inventory.json
 *   node scripts/lab-inventory.mjs --check       # exit 1 if committed JSON drifted
 *   node scripts/lab-inventory.mjs --select pr-day1 --ids-only
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const INVENTORY_PATH = 'infra/lab-inventory.json';
export const MATRIX_PATH = 'docs/validation-matrix.md';

export const AUTOMATION_TIERS = Object.freeze([
  'local-container',
  'kind-cluster',
  'kind-addon',
  'deferred',
]);

const PROFILE_HINTS = [
  { re: /contour|ingress controller/i, profile: 'day-1' },
  { re: /gateway api|envoy gateway|metrics-server/i, profile: 'day-2' },
  { re: /argo\s*cd|cert-manager|kube-prometheus|prometheus operator/i, profile: 'day-3' },
];

function stripTicks(value) {
  return value.replace(/^`+|`+$/g, '').trim();
}

export function parseMatrixRows(markdown) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) =>
    /^\|\s*Lab\s*\|\s*Section\s*\|\s*Environment\s*\|/i.test(line),
  );
  if (start < 0) {
    throw new Error(`${MATRIX_PATH}: missing lab matrix header row`);
  }

  const rows = [];
  for (let i = start + 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith('|')) break;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 6) continue;
    if (/^-+$/.test(cells[0].replaceAll(' ', ''))) continue;

    const labCell = cells[0];
    const pathMatch = labCell.match(/labs\/day-[123]\/[\w.-]+\.md/);
    if (!pathMatch) continue;

    const sectionMatch = cells[1].match(/\bS\d{2}\b/);
    rows.push({
      labPath: pathMatch[0],
      section: sectionMatch?.[0] ?? cells[1],
      sectionTitle: cells[1],
      environment: cells[2],
      addons: cells[3],
      pinned: cells[4],
      validationState: stripTicks(cells[5]),
    });
  }
  return rows;
}

export function classifyAutomationTier(row) {
  if (row.validationState === 'deferred') return 'deferred';
  if (/local\s*[—–-]\s*no cluster/i.test(row.environment)) return 'local-container';
  // Strip markdown emphasis so `**None** — …` counts as no cluster add-on.
  const addons = (row.addons ?? '').trim().replace(/\*+/g, '');
  if (addons && !/^none\b/i.test(addons)) return 'kind-addon';
  return 'kind-cluster';
}

function deriveProfile(row, tier) {
  if (tier === 'local-container' || tier === 'deferred') return null;
  const haystack = `${row.addons} ${row.sectionTitle}`;
  for (const hint of PROFILE_HINTS) {
    if (hint.re.test(haystack)) return hint.profile;
  }
  return null;
}

function derivePrivilege(row, tier) {
  if (tier === 'local-container') return 'none';
  if (tier === 'deferred') return 'cluster-admin';
  if (tier === 'kind-addon') return 'cluster-admin';
  if (/kind-only/i.test(row.environment)) return 'cluster-admin';
  if (/read-only/i.test(row.environment) && /kind\s*✓/i.test(row.environment)) {
    return 'cluster-admin-or-readonly';
  }
  return 'namespace';
}

function readEstimatedDurationMin(labMarkdown) {
  const match = labMarkdown.match(/\|\s*\*\*Estimated time\*\*\s*\|\s*(\d+)\s*min/i);
  return match ? Number(match[1]) : null;
}

function readCleanupCommand(labMarkdown) {
  const idx = labMarkdown.search(/^## Cleanup\b/m);
  if (idx < 0) return null;
  const rest = labMarkdown.slice(idx);
  const fence = rest.match(/```(?:bash|sh)?\n([\s\S]*?)```/);
  if (!fence) return null;
  const lines = fence[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
  return lines[0] ?? null;
}

function dayFromPath(labPath) {
  const match = labPath.match(/labs\/day-([123])\//);
  return match ? Number(match[1]) : null;
}

function idFromPath(labPath) {
  return labPath.replace(/^labs\//, '').replace(/\.md$/, '');
}

function solutionPathFor(repoRoot, labPath) {
  const candidate = labPath.replace(/\.md$/, '.solution.md');
  return existsSync(join(repoRoot, candidate)) ? candidate : null;
}

export function buildInventory({ repoRoot = REPO_ROOT } = {}) {
  const matrix = readFileSync(join(repoRoot, MATRIX_PATH), 'utf8');
  const rows = parseMatrixRows(matrix);
  const labs = rows.map((row) => {
    const labAbs = join(repoRoot, row.labPath);
    const labMarkdown = existsSync(labAbs) ? readFileSync(labAbs, 'utf8') : '';
    const automationTier = classifyAutomationTier(row);
    const profile = deriveProfile(row, automationTier);
    const day = dayFromPath(row.labPath);
    const prSmoke =
      day === 1 &&
      (automationTier === 'kind-cluster' || automationTier === 'kind-addon');
    const scheduleSmoke =
      (day === 2 || day === 3) &&
      (automationTier === 'kind-cluster' || automationTier === 'kind-addon');

    return {
      id: idFromPath(row.labPath),
      labPath: row.labPath,
      solutionPath: solutionPathFor(repoRoot, row.labPath),
      section: row.section,
      sectionTitle: row.sectionTitle,
      day,
      environment: row.environment,
      addons: row.addons,
      pinned: row.pinned,
      validationState: row.validationState,
      profile,
      privilege: derivePrivilege(row, automationTier),
      estimatedDurationMin: readEstimatedDurationMin(labMarkdown),
      automationTier,
      cleanupCommand: readCleanupCommand(labMarkdown),
      prSmoke,
      scheduleSmoke,
    };
  });

  return {
    schemaVersion: 1,
    sourceOfTruth: MATRIX_PATH,
    generatedBy: 'scripts/lab-inventory.mjs',
    note:
      'Markdown matrix remains the human source of truth. Regenerate JSON with ' +
      '`node scripts/lab-inventory.mjs --write` and keep CI `--check` green. ' +
      'Automation never upgrades validationState to kind-smoke without a real run ' +
      '(see docs/validation-evidence/).',
    labs,
  };
}

export function renderInventory(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

export function selectLabs(inventory, selection) {
  switch (selection) {
    case 'pr-day1':
      return inventory.labs.filter((lab) => lab.prSmoke);
    case 'schedule-day2':
      return inventory.labs.filter((lab) => lab.day === 2 && lab.scheduleSmoke);
    case 'schedule-day3':
      return inventory.labs.filter((lab) => lab.day === 3 && lab.scheduleSmoke);
    case 'all-kind':
      return inventory.labs.filter(
        (lab) => lab.automationTier === 'kind-cluster' || lab.automationTier === 'kind-addon',
      );
    default:
      throw new Error(`unknown selection '${selection}'`);
  }
}

/**
 * Delivery-facing inventory: keep exactly one S21 GitOps lab variant.
 * Argo CD → labs/day-3/21-gitops.md; Flux → labs/day-3/21-gitops-flux.md (slice C).
 */
export function mapDeliveryLabs(labs, { gitops = 'argocd' } = {}) {
  const tool = String(gitops ?? 'argocd').trim().toLowerCase();
  if (tool !== 'argocd' && tool !== 'flux') {
    throw new Error(`Unknown GitOps tool ${gitops}; use exactly one of: argocd, flux`);
  }
  return labs.filter((lab) => {
    const path = lab.labPath ?? '';
    const isGitopsLab = /\/21-gitops(?:-flux)?\.md$/.test(path);
    if (!isGitopsLab)
      return true;
    if (tool === 'flux')
      return path.endsWith('/21-gitops-flux.md');
    return path.endsWith('/21-gitops.md');
  });
}

export function main(argv = process.argv.slice(2)) {
  const write = argv.includes('--write');
  const check = argv.includes('--check');
  const idsOnly = argv.includes('--ids-only');
  const selectIdx = argv.indexOf('--select');
  const selection = selectIdx >= 0 ? argv[selectIdx + 1] : null;

  const inventory = buildInventory({ repoRoot: REPO_ROOT });
  const rendered = renderInventory(inventory);
  const outPath = join(REPO_ROOT, INVENTORY_PATH);

  if (check) {
    if (!existsSync(outPath)) {
      console.error(`missing ${INVENTORY_PATH}; run with --write`);
      process.exitCode = 1;
      return 1;
    }
    const committed = readFileSync(outPath, 'utf8');
    if (committed !== rendered) {
      console.error(`${INVENTORY_PATH} is out of date with ${MATRIX_PATH}`);
      console.error('Regenerate: node scripts/lab-inventory.mjs --write');
      process.exitCode = 1;
      return 1;
    }
    console.log(`${INVENTORY_PATH}: OK (matches ${MATRIX_PATH})`);
    return 0;
  }

  if (write) {
    writeFileSync(outPath, rendered);
    console.log(`wrote ${INVENTORY_PATH} (${inventory.labs.length} labs)`);
    return 0;
  }

  if (selection) {
    const selected = selectLabs(inventory, selection);
    if (idsOnly) {
      for (const lab of selected) console.log(lab.id);
      return 0;
    }
    process.stdout.write(renderInventory({ ...inventory, labs: selected }));
    return 0;
  }

  process.stdout.write(rendered);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

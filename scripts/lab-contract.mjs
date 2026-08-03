#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DAY_1_LABS = [
  'labs/day-1/01-containers.md',
  'labs/day-1/02-container-security.md',
  'labs/day-1/03-cluster-tour.md',
  'labs/day-1/04-kubectl.md',
  'labs/day-1/05-pod.md',
  'labs/day-1/06-deployment.md',
  'labs/day-1/07-service.md',
  'labs/day-1/08-ingress.md',
];

const REQUIRED_LAB_HEADINGS = [
  'Prerequisites',
  'Guided task',
  'Observe',
  'Challenge',
  'Verify',
  'Cleanup / reset',
];

const REQUIRED_SOLUTION_HEADINGS = [
  'Guided solutions',
  'Expected state',
  'Troubleshooting and recovery',
  'Challenge solution',
];

function headings(markdown) {
  const result = new Map();
  let inFence = false;
  markdown.split('\n').forEach((line, index) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const match = line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (match && !result.has(match[1])) result.set(match[1], index + 1);
  });
  return result;
}

function slugify(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`([^`]*)`/g, '$1')
    .replace(/[^\p{Letter}\p{Number}_ -]/gu, '')
    .replace(/ /g, '-');
}

function headingSlugs(markdown) {
  const slugs = new Set();
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = line.match(/^#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) slugs.add(slugify(match[1]));
  }
  return slugs;
}

function solutionLinks(markdown, solutionName) {
  const escaped = solutionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expression = new RegExp(`\\[[^\\]]+\\]\\(\\./${escaped}#([^\\s)]+)\\)`, 'g');
  return [...markdown.matchAll(expression)].map((match) => match[1]);
}

function unsafeCommands(markdown) {
  const errors = [];
  const lines = markdown.split('\n');
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (/\bkubectl\s+delete\s+(?:all|[^\s,]+(?:,[^\s]+)*)\s+--all\b/.test(line) &&
        /\bkubectl\s+delete\s+all\s+--all\b/.test(line)) {
      errors.push(`line ${lineNumber}: broad kubectl delete (kubectl delete all --all)`);
    }
    if (/\bkubectl\s+delete\s+(?:namespace|namespaces|ns)\b/.test(line)) {
      errors.push(`line ${lineNumber}: unqualified namespace deletion`);
    }
    if (/\brm\s+-(?=[a-z]*r)(?=[a-z]*f)[a-z]+\s+(?:\/(?:\s|[`'"]|$)|\/\*|~(?:\/|\s|[`'"]|$)|\$\{?HOME\}?|\.\.\/\.\.)/i.test(line)) {
      errors.push(`line ${lineNumber}: host-wide destructive command`);
    }
  });
  return errors;
}

export function auditLab(labPath) {
  const absoluteLab = resolve(labPath);
  const display = relative(REPO_ROOT, absoluteLab) || absoluteLab;
  const errors = [];
  if (!existsSync(absoluteLab)) return [`${display}: lab file does not exist`];

  const markdown = readFileSync(absoluteLab, 'utf8');
  const labHeadings = headings(markdown);
  for (const heading of REQUIRED_LAB_HEADINGS) {
    if (!labHeadings.has(heading)) errors.push(`${display}: missing heading: ${heading}`);
  }

  if (!markdown.includes('<!-- lab-contract:v1 -->')) {
    errors.push(`${display}: missing contract marker: <!-- lab-contract:v1 -->`);
  }

  const challengeLine = labHeadings.get('Challenge');
  const verifyLine = labHeadings.get('Verify');
  const cleanupLine = labHeadings.get('Cleanup / reset');
  if (cleanupLine && ((challengeLine && cleanupLine < challengeLine) ||
      (verifyLine && cleanupLine < verifyLine))) {
    errors.push(`${display}: Cleanup / reset must follow Challenge and Verify`);
  }

  errors.push(...unsafeCommands(markdown).map((error) => `${display}: ${error}`));

  const solutionPath = absoluteLab.replace(/\.md$/, '.solution.md');
  const solutionName = solutionPath.split('/').at(-1);
  const links = solutionLinks(markdown, solutionName);
  if (!links.includes('guided-solutions')) {
    errors.push(`${display}: missing guided solution link to ./${solutionName}#guided-solutions`);
  }
  if (!links.includes('challenge-solution')) {
    errors.push(`${display}: missing challenge solution link to ./${solutionName}#challenge-solution`);
  }

  if (!existsSync(solutionPath)) {
    errors.push(`${display}: missing sibling solution: ${solutionName}`);
    return errors;
  }

  const solution = readFileSync(solutionPath, 'utf8');
  const solutionHeadings = headings(solution);
  for (const heading of REQUIRED_SOLUTION_HEADINGS) {
    if (!solutionHeadings.has(heading)) {
      errors.push(`${relative(REPO_ROOT, solutionPath)}: missing heading: ${heading}`);
    }
  }
  const solutionSlugs = headingSlugs(solution);
  if (links.includes('guided-solutions') && !solutionSlugs.has('guided-solutions')) {
    errors.push(`${display}: dangling guided solution link`);
  }
  if (links.includes('challenge-solution') && !solutionSlugs.has('challenge-solution')) {
    errors.push(`${display}: dangling challenge solution link`);
  }

  return errors;
}

export function auditLabs(paths = DAY_1_LABS.map((path) => resolve(REPO_ROOT, path))) {
  return paths.flatMap(auditLab);
}

export function auditContractDocumentation(repoRoot = REPO_ROOT) {
  const errors = [];
  const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
  const agent = read('AGENT.md');
  const labsReadme = read('labs/README.md');
  const facilitator = read('docs/facilitator-guide.md');

  for (const token of ['<!-- lab-contract:v1 -->', 'NN-topic.solution.md', 'pnpm test:labs']) {
    if (!agent.includes(token)) errors.push(`AGENT.md: lab contract guidance must name ${token}`);
  }
  if (/collapsible\s+\*\*spoiler\*\*/i.test(agent)) {
    errors.push('AGENT.md: still requires inline collapsible spoilers');
  }

  for (const token of ['NN-topic.solution.md', '#guided-solutions', '#challenge-solution']) {
    if (!labsReadme.includes(token)) {
      errors.push(`labs/README.md: participant guidance must name ${token}`);
    }
  }
  if (!/Day 1 Labs 01[–-]08/.test(labsReadme)) {
    errors.push('labs/README.md: must scope the enforced contract to Day 1 Labs 01–08');
  }
  if (/Every task and every question[\s\S]{0,100}collapsible spoiler/i.test(labsReadme)) {
    errors.push('labs/README.md: still promises inline spoilers for every task');
  }

  if (!facilitator.includes('NN-topic.solution.md')) {
    errors.push('docs/facilitator-guide.md: must direct facilitators to sibling solutions');
  }
  if (/with a spoiler for\s+every task/i.test(facilitator)) {
    errors.push('docs/facilitator-guide.md: still promises an inline spoiler for every task');
  }
  for (const evidence of ['S08', 'Ubuntu', '2026-08-03', 'Contour v1.33.5']) {
    if (!facilitator.includes(evidence)) {
      errors.push(`docs/facilitator-guide.md: missing S08 rehearsal evidence: ${evidence}`);
    }
  }
  const pendingAddons = facilitator
    .split('\n')
    .find((line) => line.includes('add-on-heavy labs'));
  if (pendingAddons?.includes('S08')) {
    errors.push('docs/facilitator-guide.md: S08 is still listed as pending live rehearsal');
  }

  return errors;
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  const paths = process.argv.length > 2
    ? process.argv.slice(2).map((path) => resolve(path))
    : DAY_1_LABS.map((path) => resolve(REPO_ROOT, path));
  const errors = auditLabs(paths);
  if (errors.length > 0) {
    console.error(`lab-contract: FAILED with ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`lab-contract: OK — ${paths.length} participant labs and sibling solutions`);
  }
}

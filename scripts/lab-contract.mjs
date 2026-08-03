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
  'Expected state / output',
  'Explanation',
  'Troubleshooting and recovery',
  'Challenge solution',
];

function section(markdown, heading, level = 2) {
  const marker = `${'#'.repeat(level)} ${heading}`;
  const body = [];
  let collecting = false;
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) {
      if (collecting) body.push(line);
      inFence = !inFence;
      continue;
    }
    if (!inFence && line.trim() === marker) {
      collecting = true;
      continue;
    }
    if (collecting && !inFence) {
      const next = line.match(/^(#{1,6})\s+/);
      if (next && next[1].length <= level) break;
    }
    if (collecting) body.push(line);
  }
  return body.join('\n').trim();
}

function field(sectionBody, name, nextName) {
  const end = nextName
    ? `(?=\\n\\*\\*${nextName}:\\*\\*)`
    : '(?=\\n\\s*\\n|$)';
  const match = sectionBody.match(new RegExp(`\\*\\*${name}:\\*\\*\\s*([\\s\\S]*?)${end}`, 'i'));
  return match?.[1].trim() ?? '';
}

function normalized(markdown) {
  return markdown
    .replace(/[`*_#>]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasExecutableFence(markdown) {
  return /```(?:bash|sh|yaml|console)\s+[\s\S]*?```/.test(markdown);
}

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

  const challenge = section(markdown, 'Challenge');
  const difficulty = field(challenge, 'Difficulty', 'Success criteria');
  const successCriteria = field(challenge, 'Success criteria', 'Hints');
  const hints = field(challenge, 'Hints');
  if (!difficulty) errors.push(`${display}: missing Challenge Difficulty`);
  if (!successCriteria) errors.push(`${display}: missing Challenge Success criteria`);
  if (!hints) errors.push(`${display}: missing Challenge Hints`);
  if (!/diagnos|compare|predict|explain|adapt|change|without|prove|investigate|measure|infer|design|translate/i.test(challenge)) {
    errors.push(`${display}: Challenge must require transfer or diagnosis`);
  }

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

  const guidedSolution = section(solution, 'Guided solutions');
  const expectedState = section(solution, 'Expected state / output');
  const explanation = section(solution, 'Explanation');
  const troubleshooting = section(solution, 'Troubleshooting and recovery');
  const challengeSolution = section(solution, 'Challenge solution');
  if (!hasExecutableFence(guidedSolution)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Guided solutions need exact commands or a manifest`);
  }
  if (normalized(expectedState).length < 20) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Expected state / output is empty`);
  }
  if (normalized(explanation).length < 20) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Explanation is empty`);
  }
  if (normalized(troubleshooting).length < 20 || !/`[^`]+`|```/.test(troubleshooting)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Troubleshooting needs likely-failure recovery commands`);
  }

  const challengeCommands = section(challengeSolution, 'Commands / manifest', 3);
  const challengeExpected = section(challengeSolution, 'Expected state / output', 3);
  const challengeExplanation = section(challengeSolution, 'Explanation', 3);
  const challengeHints = section(challengeSolution, 'Hints', 3);
  if (!hasExecutableFence(challengeCommands)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge solution needs exact commands or a manifest`);
  }
  if (normalized(challengeExpected).length < 20) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge expected state / output is empty`);
  }
  if (normalized(challengeExplanation).length < 20) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge explanation is empty`);
  }
  if (!hints || !normalized(challengeHints).includes(normalized(hints))) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge hints do not match participant hints`);
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

export function auditDayOneCommandTruth(repoRoot = REPO_ROOT) {
  const errors = [];
  const read = (path) => readFileSync(resolve(repoRoot, path), 'utf8');
  const lab02 = read('labs/day-1/02-container-security.md');
  const lab07 = read('labs/day-1/07-service.md');
  const solution07 = read('labs/day-1/07-service.solution.md');
  const lab08 = read('labs/day-1/08-ingress.md');

  const verify02 = section(lab02, 'Verify');
  if (!/save demo:hardened[^\n]*\|\s*tar -x/.test(verify02) || !verify02.includes('gzip -dc')) {
    errors.push('Lab 02: final secret absence check must extract and inspect compressed layers');
  }
  if (/grep\s+-aRq[^\n]*hardened\.tar/.test(verify02)) {
    errors.push('Lab 02: final secret absence check must not grep only the outer archive');
  }

  if (!lab07.includes('sleep 3600') || !solution07.includes('sleep 3600')) {
    errors.push('Lab 07: diagnostic client must remain alive for the complete lab');
  }
  if (!section(lab07, 'Cleanup / reset').includes('kubectl delete pod tmp')) {
    errors.push('Lab 07: cleanup must delete the named diagnostic client');
  }

  for (const token of ['export LAB_ENV=', 'export WEB_HOST=', 'export WEB2_HOST=', 'host: ${WEB_HOST}', 'host: ${WEB2_HOST}']) {
    if (!lab08.includes(token)) errors.push(`Lab 08: missing deterministic environment token: ${token}`);
  }
  if (!lab08.includes('curl -fsS "http://$WEB_HOST/"')) {
    errors.push('Lab 08: shared-cluster path needs an exact DNS-host curl command');
  }
  if (lab08.includes('if kubectl get secret web-tls')) {
    errors.push('Lab 08: TLS verification must branch on LAB_ENV, not Secret existence');
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

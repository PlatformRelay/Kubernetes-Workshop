#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

export const DAY_2_LABS = [
  'labs/day-2/09-gateway-api.md',
  'labs/day-2/10-config.md',
  'labs/day-2/11-storage.md',
  'labs/day-2/12-statefulset.md',
  'labs/day-2/13-resources.md',
  'labs/day-2/14-probes.md',
  'labs/day-2/15-jobs.md',
  'labs/day-2/16-hpa.md',
];

/** Day 3 authored labs under the sibling-solution contract (S24 kubebuilder deferred). */
export const DAY_3_LABS = [
  'labs/day-3/17-pod-security.md',
  'labs/day-3/18-networkpolicy.md',
  'labs/day-3/19-rbac.md',
  'labs/day-3/20-helm.md',
  'labs/day-3/21-gitops.md',
  'labs/day-3/22-operator-concept.md',
  'labs/day-3/23-prometheus.md',
  'labs/day-3/25-pod-escape.md',
  'labs/day-3/26-capstone.md',
];

/**
 * Reviewed exceptions: paths present under labs/ but excluded from CONTRACTED_LABS.
 * S24 remains a deferred stub (Go/kubebuilder toolchain) — no invented sibling solution.
 */
export const DEFERRED_LAB_EXCEPTIONS = [
  {
    path: 'labs/day-3/24-kubebuilder.md',
    reason: 'S24 kubebuilder is a deferred stub; sibling-solution contract waits on toolchain authoring',
  },
];

export const CONTRACTED_LABS = [...DAY_1_LABS, ...DAY_2_LABS, ...DAY_3_LABS];

const REQUIRED_LAB_HEADINGS = [
  'Objective',
  'Prerequisites',
  'Files used',
  'Guided task',
  'Observe',
  'Challenge',
  'Verify',
  'Cleanup / reset',
];

const ORDERED_LAB_HEADINGS = [...REQUIRED_LAB_HEADINGS];

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

function words(markdown) {
  return normalized(markdown).match(/[\p{Letter}\p{Number}]+/gu) ?? [];
}

function executableFences(markdown) {
  return [...markdown.matchAll(/```(bash|sh|yaml|console)\s+([\s\S]*?)```/g)]
    .map((match) => ({ language: match[1], body: match[2] }));
}

function hasSubstantiveExecutableFence(markdown) {
  return executableFences(markdown).some(({ language, body }) => {
    if (language === 'yaml') {
      return /(?:^|\n)\s*(?:apiVersion|kind):\s*\S+/m.test(body) && words(body).length >= 6;
    }
    const commands = body
      .split('\n')
      .map((line) => line.replace(/^\s*\$\s*/, '').trim())
      .filter((line) => line && !line.startsWith('#') && !/^(?:echo|printf)\b/.test(line) &&
        !/^(?:true|false|:)\s*$/.test(line));
    return commands.some((line) => words(line).length >= 3 &&
      /(?:^|[;&|]\s*|\s)(?:kubectl|docker|podman|nerdctl|curl|wget|trivy|cosign|openssl|git|find|grep|sed|cat|\$ENGINE)\b/.test(line),
    );
  });
}

function hasObservableResult(markdown) {
  return words(markdown).length >= 6 &&
    /ready|running|cached|exists|absent|present|returns?|prints?|output|status|count|address|endpoint|http|https|uid|digest|component|resource|replica|match|field|path|succeeds?|fails?|reaches?|appears?|disappears?/i.test(markdown);
}

function hasCausalAccount(markdown) {
  return words(markdown).length >= 10 &&
    /because|therefore|\bso\b|when|while|due|caus|means|allows?|permits?|requires?|retains?|removes?|preserves?|invalidates?|tracks?|supplies?|trades?|asks?/i.test(markdown);
}

function hasConcreteCorrectiveCommand(markdown) {
  const code = [
    ...executableFences(markdown).map(({ body }) => body),
    ...[...markdown.matchAll(/`([^`]+)`/g)].map((match) => match[1]),
  ];
  return /restore|reapply|rerun|remove|delete|undo|patch|reset|retry|fix|recover/i.test(markdown) &&
    code.some((snippet) => words(snippet).length >= 3 &&
      /(?:kubectl\s+(?:apply|delete|patch|label|create|rollout\s+undo|config\s+use-context)|\$ENGINE\s+(?:build|rm)|(?:^|\s)rm\s+-)/.test(snippet));
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

function metadataFields(markdown) {
  const result = new Map();
  const expression = /^\|\s*\*\*(Section|Environment|Estimated time)\*\*\s*\|\s*([^|\n]+?)\s*\|\s*$/gm;
  for (const match of markdown.matchAll(expression)) result.set(match[1], match[2].trim());
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
    if (/\bkubectl\s+delete\s+all\s+--all\b/.test(line)) {
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
  if (!/^# Lab \d{2}\s+—\s+\S.+$/u.test(markdown.split('\n')[0])) {
    errors.push(`${display}: missing lab title`);
  }
  for (const heading of REQUIRED_LAB_HEADINGS) {
    if (!labHeadings.has(heading)) errors.push(`${display}: missing heading: ${heading}`);
  }

  const metadata = metadataFields(markdown);
  for (const name of ['Section', 'Estimated time', 'Environment']) {
    const value = metadata.get(name);
    if (!value) {
      errors.push(`${display}: missing metadata field: ${name}`);
      continue;
    }
    const substantive = name === 'Estimated time'
      ? /\b\d+\s*(?:min(?:ute)?s?|h(?:ou)?rs?)\b/i.test(value)
      : words(value).length >= 2 && !/^(?:x|tbd|todo|n\/a)$/i.test(normalized(value));
    if (!substantive) errors.push(`${display}: metadata field is not substantive: ${name}`);
  }

  const objectiveOffset = markdown.indexOf('\n## Objective');
  const metadataOffsets = ['Section', 'Environment', 'Estimated time']
    .map((name) => markdown.indexOf(`| **${name}** |`));
  if (objectiveOffset >= 0 && metadataOffsets.every((offset) => offset >= 0) &&
      metadataOffsets.some((offset) => offset > objectiveOffset)) {
    errors.push(`${display}: lab title, metadata, and sections must follow prescribed order`);
  }

  const orderedLines = ORDERED_LAB_HEADINGS.map((heading) => labHeadings.get(heading));
  if (orderedLines.every(Boolean) && orderedLines.some((line, index) => index > 0 && line <= orderedLines[index - 1])) {
    errors.push(`${display}: lab sections must follow prescribed order`);
  }

  for (const [heading, minimum] of [
    ['Objective', 10],
    ['Prerequisites', 4],
    ['Files used', 4],
    ['Guided task', 12],
    ['Observe', 8],
    ['Verify', 5],
    ['Cleanup / reset', 4],
  ]) {
    if (labHeadings.has(heading) && words(section(markdown, heading)).length < minimum) {
      errors.push(`${display}: section is not substantive: ${heading}`);
    }
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
  const challengeTask = challenge.split(/\n\*\*Difficulty:\*\*/i)[0];
  const difficulty = field(challenge, 'Difficulty', 'Success criteria');
  const successCriteria = field(challenge, 'Success criteria', 'Hints');
  const hints = field(challenge, 'Hints');
  if (!difficulty) errors.push(`${display}: missing Challenge Difficulty`);
  if (!successCriteria) errors.push(`${display}: missing Challenge Success criteria`);
  if (!hints) errors.push(`${display}: missing Challenge Hints`);
  if (words(challengeTask).length < 8) {
    errors.push(`${display}: Challenge task is too shallow`);
  }
  if (difficulty && !/^(?:Beginner|Intermediate|Advanced)$/i.test(difficulty)) {
    errors.push(`${display}: Challenge Difficulty must be Beginner, Intermediate, or Advanced`);
  }
  if (successCriteria && (words(successCriteria).length < 8 ||
      !/build|create|delete|find|produce|prove|measure|identify|show|keep|restore|run|scan|generate|explain|compare/i.test(successCriteria) ||
      !/ready|running|cached|exists|absent|present|returns?|prints?|output|status|count|address|endpoint|http|https|uid|digest|component|resource|replica|match|reaches?|appears?|disappears?|field|path/i.test(successCriteria))) {
    errors.push(`${display}: Challenge Success criteria need an action and observable success signal`);
  }
  if (hints && (words(hints).length < 7 ||
      !/compare|use|inspect|record|capture|reuse|pipe|keep|branch|move|watch|confirm|start|look|check/i.test(hints))) {
    errors.push(`${display}: Challenge Hints need actionable guidance`);
  }
  if (!/diagnos|compare|predict|explain|adapt|change|without|prove|investigate|measure|infer|design|translate/i.test(challenge)) {
    errors.push(`${display}: Challenge must require transfer or diagnosis`);
  }

  const solutionPath = absoluteLab.replace(/\.md$/, '.solution.md');
  const solutionName = solutionPath.split('/').at(-1);
  const links = solutionLinks(markdown, solutionName);
  const guidedLinks = solutionLinks(section(markdown, 'Guided task'), solutionName);
  const challengeLinks = solutionLinks(section(markdown, 'Challenge'), solutionName);
  if (!links.includes('guided-solutions') || !guidedLinks.includes('guided-solutions')) {
    errors.push(`${display}: missing guided solution link to ./${solutionName}#guided-solutions`);
  }
  if (!links.includes('challenge-solution') || !challengeLinks.includes('challenge-solution')) {
    errors.push(`${display}: missing challenge solution link to ./${solutionName}#challenge-solution`);
  }

  if (!existsSync(solutionPath)) {
    errors.push(`${display}: missing sibling solution: ${solutionName}`);
    return errors;
  }

  const solution = readFileSync(solutionPath, 'utf8');
  errors.push(...unsafeCommands(solution).map((error) =>
    `${relative(REPO_ROOT, solutionPath)}: ${error}`));
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
  if (!hasSubstantiveExecutableFence(guidedSolution)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Guided solutions need substantive commands or a manifest`);
  }
  if (!hasObservableResult(expectedState)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Expected state / output needs an observable result`);
  }
  if (!hasCausalAccount(explanation)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Explanation needs a causal account`);
  }
  if (!hasConcreteCorrectiveCommand(troubleshooting)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Troubleshooting needs a concrete corrective command`);
  }

  const challengeCommands = section(challengeSolution, 'Commands / manifest', 3);
  const challengeExpected = section(challengeSolution, 'Expected state / output', 3);
  const challengeExplanation = section(challengeSolution, 'Explanation', 3);
  const challengeHints = section(challengeSolution, 'Hints', 3);
  if (!hasSubstantiveExecutableFence(challengeCommands)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge solution needs substantive commands or a manifest`);
  }
  if (!hasObservableResult(challengeExpected)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge expected state / output needs an observable result`);
  }
  if (!hasCausalAccount(challengeExplanation)) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge explanation needs a causal account`);
  }
  if (!hints || !normalized(challengeHints).includes(normalized(hints))) {
    errors.push(`${relative(REPO_ROOT, solutionPath)}: Challenge hints do not match participant hints`);
  }

  return errors;
}

export function auditLabs(paths = CONTRACTED_LABS.map((path) => resolve(REPO_ROOT, path))) {
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
  if (!/Day 1 Labs 01[–-]08/.test(labsReadme) ||
      !/Day 2 Labs 09[–-]16/.test(labsReadme) ||
      !/Day 3 Labs 17[–-]23,\s*25[–-]26/.test(labsReadme)) {
    errors.push('labs/README.md: must scope the enforced contract to Day 1 Labs 01–08, Day 2 Labs 09–16, and Day 3 Labs 17–23, 25–26');
  }
  if (!/S24/.test(labsReadme) || !/deferred/i.test(labsReadme)) {
    errors.push('labs/README.md: must call out S24 as the deferred sibling-solution exception');
  }
  if (!/## Completion matrix/i.test(labsReadme)) {
    errors.push('labs/README.md: must track contracted labs in a completion matrix');
  }
  if (!/Day 3 Labs 17[–-]23,\s*25[–-]26/.test(agent) && !/Labs 01[–-]23,\s*25[–-]26/.test(agent)) {
    errors.push('AGENT.md: must name Day 3 Labs 17–23, 25–26 in the enforced contract slice');
  }
  if (!/S24/.test(agent) || !/deferred/i.test(agent)) {
    errors.push('AGENT.md: must name S24 as deferred outside the sibling-solution inventory');
  }
  if (/Every task and every question[\s\S]{0,100}collapsible spoiler/i.test(labsReadme)) {
    errors.push('labs/README.md: still promises inline spoilers for every task');
  }

  if (!facilitator.includes('NN-topic.solution.md')) {
    errors.push('docs/facilitator-guide.md: must direct facilitators to sibling solutions');
  }
  if (!/Day 3 Labs 17[–-]23,\s*25[–-]26/.test(facilitator) &&
      !/Labs 01[–-]23,\s*25[–-]26/.test(facilitator) &&
      !/Day 1 Labs 01[–-]08[\s\S]{0,120}Day 2 Labs 09[–-]16[\s\S]{0,120}Day 3/.test(facilitator)) {
    errors.push('docs/facilitator-guide.md: must mention Day 3 Labs 17–23, 25–26 sibling companions');
  }
  if (/with a spoiler for\s+every task/i.test(facilitator)) {
    errors.push('docs/facilitator-guide.md: still promises an inline spoiler for every task');
  }
  if (/ingress2gateway\s+challenge/i.test(facilitator)) {
    errors.push('docs/facilitator-guide.md: ingress2gateway must not be called the challenge');
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

  const adrIndex = read('docs/decisions/README.md');
  const adrFiles = readdirSync(resolve(repoRoot, 'docs/decisions'))
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .sort();
  let acceptedSiblingContract = false;
  for (const file of adrFiles) {
    const text = read(`docs/decisions/${file}`);
    const statusLine = text.split('\n').find((line) => /^\s*-\s*\*\*Status:\*\*/.test(line)) || '';
    const accepted = /\baccepted\b/.test(statusLine) && !/\bsuperseded\b/.test(statusLine);
    if (accepted && /Solutions live inline/i.test(text)) {
      errors.push(`docs/decisions/${file}: accepted ADR still requires inline solutions`);
    }
    if (accepted && text.includes('NN-topic.solution.md')) {
      acceptedSiblingContract = true;
    }
  }
  if (!acceptedSiblingContract) {
    errors.push('docs/decisions: an accepted ADR must name the NN-topic.solution.md sibling contract');
  }
  const adr0009Row = adrIndex
    .split('\n')
    .find((line) => line.includes('0009-single-file-lab-convention.md'));
  if (!adr0009Row || !/superseded by 0012/i.test(adr0009Row)) {
    errors.push('docs/decisions/README.md: ADR 0009 must be marked superseded after the sibling-solution decision');
  }

  return errors;
}

/** Day-1 through-line names that Day-2 Troubleshooting must not invent when the lab never creates them. */
const DAY_TWO_GENERIC_MANIFEST_ALIASES = ['pod.yaml', 'deployment.yaml'];

function yamlBasenamesCited(text) {
  const names = new Set();
  for (const match of text.matchAll(/(?:^|\s|[`'"])((?:[\w.-]+\/)*[\w.-]+\.ya?ml)\b/g)) {
    names.add(match[1].split('/').at(-1));
  }
  return names;
}

/**
 * Day 2 cleanup / panic-reset truth: namespaced `kubectl delete … --all` belongs only as a
 * commented panic path (Labs 10–16 pattern), never as the default live Cleanup command.
 * Also rejects bit-identical Troubleshooting blocks across Day 2 sibling solutions, and
 * Day-1 generic manifest names (`pod.yaml` / `deployment.yaml`) absent from the sibling lab.
 */
export function auditDayTwoCleanupTruth(repoRoot = REPO_ROOT) {
  const errors = [];
  const troubleshootingNorms = new Map();

  const paths = [
    ...DAY_2_LABS,
    ...DAY_2_LABS.map((path) => path.replace(/\.md$/, '.solution.md')),
  ];
  for (const path of paths) {
    const absolute = resolve(repoRoot, path);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, 'utf8');

    for (const heading of ['Cleanup / reset', 'Cleanup / panic reset']) {
      if (!headings(text).has(heading)) continue;
      const cleanup = section(text, heading);
      for (const line of cleanup.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (/\bkubectl\s+delete\b/.test(trimmed) && /\s--all\b/.test(trimmed) &&
            (/\s-n\b/.test(trimmed) || /\$NS/.test(trimmed))) {
          errors.push(
            `${path}: Cleanup must comment namespaced --all panic resets (not ship them live)`,
          );
        }
      }
    }

    if (!path.endsWith('.solution.md')) continue;
    const troubleshooting = section(text, 'Troubleshooting and recovery');
    const key = normalized(troubleshooting);
    if (!key) continue;
    const prior = troubleshootingNorms.get(key);
    if (prior) {
      errors.push(
        `${prior} and ${path}: Troubleshooting must not be bit-identical across Day 2 solutions`,
      );
    } else {
      troubleshootingNorms.set(key, path);
    }

    const labPath = path.replace(/\.solution\.md$/, '.md');
    const labAbsolute = resolve(repoRoot, labPath);
    if (!existsSync(labAbsolute)) continue;
    const labFiles = yamlBasenamesCited(readFileSync(labAbsolute, 'utf8'));
    const cited = yamlBasenamesCited(troubleshooting);
    for (const alias of DAY_TWO_GENERIC_MANIFEST_ALIASES) {
      if (cited.has(alias) && !labFiles.has(alias)) {
        errors.push(
          `${path}: Troubleshooting cites ${alias}, but that file is not in ${labPath}`,
        );
      }
    }
  }
  return errors;
}

/**
 * Day 3 cleanup / panic-reset truth: no fake runnable prose, no unclosed backticks,
 * and no line-split `kubectl delete` + `namespace` that bypasses single-line unsafeCommands.
 */
export function auditDayThreeCleanupTruth(repoRoot = REPO_ROOT) {
  const errors = [];
  const day3Dir = resolve(repoRoot, 'labs/day-3');
  const contracted = new Set(DAY_3_LABS);
  const deferred = new Set(DEFERRED_LAB_EXCEPTIONS.map((entry) => entry.path));

  if (existsSync(day3Dir)) {
    for (const name of readdirSync(day3Dir).filter((file) => file.endsWith('.md') && !file.endsWith('.solution.md'))) {
      const path = `labs/day-3/${name}`;
      if (!contracted.has(path) && !deferred.has(path)) {
        errors.push(`${path}: day-3 participant lab must be contracted or listed in DEFERRED_LAB_EXCEPTIONS`);
      }
    }
  }

  const paths = [
    ...DAY_3_LABS,
    ...DAY_3_LABS.map((path) => path.replace(/\.md$/, '.solution.md')),
  ];
  for (const path of paths) {
    const absolute = resolve(repoRoot, path);
    if (!existsSync(absolute)) continue;
    const text = readFileSync(absolute, 'utf8');
    if (/remove the lab Namespace object\s*\(kind:\s*burn the cluster\)/i.test(text)) {
      errors.push(`${path}: cleanup must not use nonsensical Namespace-object / burn-the-cluster prose`);
    }
    if (/`[^`\n]*remove the lab Namespace[^`\n]*$/m.test(text)) {
      errors.push(`${path}: cleanup must not leave an unclosed code span around Namespace tear-down prose`);
    }
    if (/kubectl\s+delete\s*\n\s*namespace\b/i.test(text)) {
      errors.push(`${path}: namespace deletion must not be line-split to bypass unsafeCommands`);
    }
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
  for (const token of [
    'export INGRESS_CLASS="platformrelay-lab08-$(openssl rand -hex 6)"',
    'grep -Fx -- "--ingress-class-name=$INGRESS_CLASS"',
    '\\"value\\":\\"--ingress-class-name=$INGRESS_CLASS\\"',
    'kubectl get ingressclass "$INGRESS_CLASS" >/dev/null',
  ]) {
    if (!lab08.includes(token)) {
      errors.push(`Lab 08: missing collision-safe class isolation token: ${token}`);
    }
  }
  const challenge08 = section(lab08, 'Challenge');
  const criteria08 = field(challenge08, 'Success criteria', 'Hints');
  if (/ingress2gateway|Gateway|HTTPRoute|translat/i.test(criteria08)) {
    errors.push('Lab 08: unpinned ingress2gateway must not be mandatory challenge acceptance');
  }
  if (!/Extension 2 \(optional, read-only\)/.test(lab08) ||
      !/not part of the challenge success criteria or verification/i.test(lab08)) {
    errors.push('Lab 08: ingress2gateway preview must be clearly optional and outside verification');
  }

  const prereq08 = section(lab08, 'Prerequisites');
  if (!/\$NS[^\n]*default namespace/i.test(prereq08)) {
    errors.push('Lab 08: Prerequisites must restate that $NS is the default namespace');
  }
  const cleanup08 = section(lab08, 'Cleanup / reset');
  if (/TLS Secret from the stretch/i.test(cleanup08) ||
      /cert files from the stretch/i.test(cleanup08)) {
    errors.push('Lab 08: Cleanup must not label Challenge TLS as optional stretch');
  }

  return errors;
}

const invokedAsScript = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedAsScript) {
  const paths = process.argv.length > 2
    ? process.argv.slice(2).map((path) => resolve(path))
    : CONTRACTED_LABS.map((path) => resolve(REPO_ROOT, path));
  const errors = auditLabs(paths);
  if (errors.length > 0) {
    console.error(`lab-contract: FAILED with ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`lab-contract: OK — ${paths.length} participant labs and sibling solutions`);
  }
}

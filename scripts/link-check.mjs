#!/usr/bin/env node
// Deterministic, offline link checker for the workshop's front-door docs.
//
// It validates, across README.md + docs/syllabus.md + docs/facilitator-guide.md
// + labs/README.md:
//   1. No unresolved `<pages-url>` (or any `<…>`-style URL) placeholder remains.
//   2. Every internal (relative) link target file exists on disk.
//   3. Every in-document `#anchor` resolves to a heading in the target file,
//      using GitHub's heading-slug algorithm.
//
// External (http/https/mailto) links are reported for information only and never
// fail the check — liveness is flaky (rate limits) and must not gate CI.
//
// Zero runtime dependencies (plain Node ESM) so CI needs no install step.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DOCS = [
  'README.md',
  'docs/syllabus.md',
  'docs/facilitator-guide.md',
  'labs/README.md',
];

// --- GitHub heading-slug algorithm --------------------------------------------
// lowercase → drop everything that is not alphanumeric / space / hyphen →
// spaces to hyphens → de-duplicate repeated slugs with -1, -2, …
function slugify(heading) {
  const base = heading
    .trim()
    .toLowerCase()
    .replace(/[^\w\- ]/g, '') // \w keeps a-z0-9_; strips punctuation, &, :, (), etc.
    .replace(/ /g, '-');
  return base;
}

// Collect the set of anchor slugs a Markdown file exposes (from ATX headings).
function headingSlugs(markdown) {
  const seen = new Map();
  const slugs = new Set();
  let inFence = false;
  for (const rawLine of markdown.split('\n')) {
    const fence = rawLine.match(/^\s*(```|~~~)/);
    if (fence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = rawLine.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    // Strip inline markdown from the heading text before slugging (links, code, emphasis).
    let text = m[2]
      .replace(/`([^`]*)`/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_]/g, '');
    let slug = slugify(text);
    if (seen.has(slug)) {
      const n = seen.get(slug) + 1;
      seen.set(slug, n);
      slug = `${slug}-${n}`;
    } else {
      seen.set(slug, 0);
    }
    slugs.add(slug);
  }
  return slugs;
}

// Extract markdown links [text](target), skipping fenced code blocks and images.
// (Images `![alt](target)` ARE checked — a broken embedded image is a defect.)
function extractLinks(markdown) {
  const links = [];
  const lines = markdown.split('\n');
  let inFence = false;
  const linkRe = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    let m;
    while ((m = linkRe.exec(line)) !== null) {
      links.push({ target: m[1], line: i + 1 });
    }
  });
  return links;
}

// Detect unresolved placeholder URLs like <pages-url> anywhere in the file
// (in link targets OR bare text), so a stray `<pages-url>/3day/` cannot slip through.
function findPlaceholders(markdown) {
  const hits = [];
  const lines = markdown.split('\n');
  let inFence = false;
  // Angle-bracket tokens that look like placeholders: <word-word>, optionally with a path.
  const re = /<([a-z][a-z0-9-]*(?:-url|-URL|url))>/gi;
  lines.forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    let m;
    while ((m = re.exec(line)) !== null) {
      hits.push({ token: m[0], line: i + 1 });
    }
  });
  return hits;
}

const errors = [];
const info = [];

// Cache heading slugs per resolved file path.
const slugCache = new Map();
function slugsFor(absPath) {
  if (slugCache.has(absPath)) return slugCache.get(absPath);
  let slugs = new Set();
  if (existsSync(absPath) && statSync(absPath).isFile()) {
    slugs = headingSlugs(readFileSync(absPath, 'utf8'));
  }
  slugCache.set(absPath, slugs);
  return slugs;
}

for (const doc of DOCS) {
  const absDoc = resolve(REPO_ROOT, doc);
  if (!existsSync(absDoc)) {
    errors.push(`${doc}: file listed for checking does not exist`);
    continue;
  }
  const md = readFileSync(absDoc, 'utf8');
  const docDir = dirname(absDoc);

  for (const { token, line } of findPlaceholders(md)) {
    errors.push(`${doc}:${line}: unresolved placeholder \`${token}\``);
  }

  for (const { target, line } of extractLinks(md)) {
    // Skip pure external / protocol links (informational only).
    if (/^(https?:|mailto:|tel:)/i.test(target)) {
      info.push(`${doc}:${line}: external ${target}`);
      continue;
    }
    // A placeholder used as a link target is caught by findPlaceholders already,
    // but guard against it resolving to a bogus file.
    if (target.includes('<') && target.includes('>')) continue;

    const [pathPart, anchor] = target.split('#');

    if (pathPart === '') {
      // Same-file anchor (#section).
      if (anchor && !slugsFor(absDoc).has(anchor)) {
        errors.push(`${doc}:${line}: broken same-file anchor #${anchor}`);
      }
      continue;
    }

    // Resolve the linked file relative to the current doc.
    const absTarget = resolve(docDir, pathPart);

    if (!existsSync(absTarget)) {
      errors.push(
        `${doc}:${line}: missing internal target ${pathPart} ` +
          `(resolved ${relative(REPO_ROOT, absTarget)})`
      );
      continue;
    }

    // Anchor into another file → verify the heading exists there (only for .md).
    if (anchor && absTarget.endsWith('.md')) {
      if (!slugsFor(absTarget).has(anchor)) {
        errors.push(
          `${doc}:${line}: broken anchor #${anchor} in ${pathPart}`
        );
      }
    }
  }
}

if (process.env.LINK_CHECK_VERBOSE) {
  for (const line of info) console.log(`info: ${line}`);
}

if (errors.length > 0) {
  console.error(`link-check: FAILED with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log(
  `link-check: OK — ${DOCS.length} docs, no placeholders, ` +
    `all internal links and anchors resolve.`
);

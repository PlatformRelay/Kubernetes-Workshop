# Supply-chain policy

The repository fails CI when the locked JavaScript dependency graph contains an
unexcepted **high** or **critical** advisory, a workflow uses a mutable action
reference, or maintained executable setup code introduces an ungoverned remote
download or execution path.

Run the same gates locally:

```sh
pnpm install --frozen-lockfile
node --test scripts/supply-chain-policy.test.mjs scripts/dependency-audit.test.mjs
node scripts/supply-chain-policy.mjs
node scripts/dependency-audit.mjs
```

## Dependency audit policy

`scripts/dependency-audit.mjs` runs `pnpm audit` against the dependency graph in
`pnpm-lock.yaml`. High and critical advisories fail. Lower severities remain
visible in the count and are reviewed during routine dependency updates.

An accepted risk must be added to `supply-chain/dependency-audit.json` with all
of these fields:

```json
{
  "id": "GHSA-xxxx-yyyy-zzzz",
  "reason": "Why the vulnerable path is not reachable or cannot yet be upgraded.",
  "owner": "maintainers",
  "expires": "2026-08-31"
}
```

Expired or malformed exceptions fail the gate. An audit command that cannot
return parseable scanner output exits separately as **scanner unavailable**; it
is never reported as a clean result. Unexpected scanner status and high/critical
metadata that disagrees with the advisory records fail the same way. CI fails closed. For a time-critical
release, the only waiver is a reviewed, committed advisory exception with an
owner and near-term expiry—never an environment variable that silently skips
the scanner.

## GitHub Actions policy

Every external action in `.github/workflows/` uses a 40-character commit SHA and
a nearby version comment, for example:

```yaml
- uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
```

Container actions, if introduced, must use an image digest. Local actions under
`./` are allowed. Renovate's GitHub Actions manager has `pinDigests: true`, so
updates remain reviewable proposals and preserve immutable references.

Every workflow declares read-only permissions at the workflow level. Jobs that
publish an image, Pages deployment, or release artifact opt into only the write
or OIDC permissions they need. Release assembly and validation run in a
separate read-only job; only the final publication job receives `contents:
write`.

## Remote downloads

The policy currently covers two executable trust boundaries:

- every artifact URL generated in `mise.lock` must have a `sha256` checksum in
  the same platform entry;
- maintained shell, Python, and Node setup/automation under `infra/`, `setup/`,
  `scripts/`, `.github/`, plus the root launch/task surfaces may not download a
  remote input—or pipe one into a shell—without a named, documented, unexpired
  entry in `supply-chain/exceptions.json`;
- direct, aliased, and simply token-assembled `curl`/`wget`, Python HTTP clients
  and subprocess calls, and Node `fetch` are treated as network-capable
  callsites. A new callsite fails until its exact command is reviewed.

Each exception binds an exact HTTPS `source` to one of two auditable kinds:

- `accepted-risk` requires an exact, whitespace-normalized literal `command`
  with no dynamic source. It states plainly that the bytes are not
  checksum-pinned and gives the reason and expiry for that temporary risk
  acceptance;
- `sha256` permits only one deliberately narrow flow: `curl -fsSL <source> -o
  <output>`, then `printf ... | sha256sum -c -`, then `bash <output>`. The source,
  simple output filename, exact digest, verified file, and executed file must
  all match the inventory. Comments do not satisfy a verification step.

This is a fail-closed drift inventory for ordinary maintained code. It catches
accidental mutable inputs and the common indirection forms covered by its
mutation tests. It is **not** a proof against intentionally obfuscated malicious
code; review, branch protection, and the immutable workflow/action policy remain
the controls for hostile changes.

The interactive mise convenience installer is the only current exception. It
is isolated from non-interactive/CI setup, but the installer bytes themselves
are **not checksum-pinned**. That accepted risk expires on **2026-11-03** so the
bootstrap path must be reviewed again.

Learner-facing labs currently contain direct, versioned `kubectl apply -f URL`
commands. They are intentionally not misrepresented as checksum-verified by
this gate: converting those commands to cached, checksummed add-on inputs is
owned by the add-on/lab execution work. Until that lands, these URLs remain a
known residual rather than a false green claim.

## Existing and residual evidence

The `workshop-web` image workflow already scans images at HIGH/CRITICAL, signs
image digests, and attests an SPDX SBOM. This change pins that workflow's
actions but does not claim a new image run occurred.

CodeQL default setup is repository configuration owned by US-CI-CODEQL. Its
first scan and triage cannot be proven by a local change, so this gate does not
fabricate that evidence. Dependency SBOM retention for published deck release
artifacts likewise remains release-workflow scope.

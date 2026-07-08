---
layout: section-cover
day: Day 1
section: '02'
tier: recommended
track: Foundations
---

# Container security & supply chain

Build images that are small, non-root, and scanned — the build-time half of security.

**recommended** · suggested Day 1 · Foundations track

<!--
Section S02 — Container security & supply chain. Timing: ~30 min slides + 25 min lab.
Outcome: learners can build and choose images that are small, non-root, and scanned —
the build-time half of Kubernetes security (S17/S25 cover the runtime half).
Beats: the risky image (fat + root + baked secret) · four build-time moves ·
harden it one fix per step (magic-move) · a deleted layer still ships · scanning
(illustrative, tools as examples) · SBOM · sign + pin by digest · foreshadow S17/S25/S26.
CKx tie-in: CKAD/CKA security foundations (image hygiene precedes runtime hardening).
Lab: labs/day-1/02-container-security.md.
-->

---
layout: code-annotated
heading: 'The image that ships your next incident'
compact: true
---

```dockerfile {none|1|3|4|6}
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENTRYPOINT ["/bin/app"]
```

::notes::

<CodeNote at="1" label="fat base" variant="warn">
The full Go toolchain — compiler, shell, package manager — <strong>ships to
production</strong>. Every one of those is code an attacker can use and a CVE you
now own.
</CodeNote>

<CodeNote at="2" label="COPY . ." variant="warn">
Copies the <strong>whole build context</strong> into a layer — <code>.git</code>,
local <code>.env</code> files, test fixtures. What you didn't mean to ship is now
shipped.
</CodeNote>

<CodeNote at="3" label="baked secret" variant="danger">
A private key written into a layer. Even if a later step deletes it, the layer
that added it <strong>still exists</strong> in the image history — recoverable by
anyone who pulls it.
</CodeNote>

<CodeNote at="4" label="root" variant="danger">
No <code>USER</code>, so PID 1 is <strong>root</strong>. A process escape from
this container starts as root on the node — exactly what Day 3's pod-escape module
attacks.
</CodeNote>

<!--
Speaker: four independent mistakes in six lines, and every one is common. This
slide is the "before"; the magic-move two slides on is the "after". The secret
and the root user are the two that graduate into runtime attacks (S17/S25).
-->

---

<span class="kw-kicker">The build-time half of security</span>

# Four moves that shrink the attack surface

<div class="kw-cols-2 mt-4">
  <v-click at="1">
    <KwCard heading="Minimal / distroless base" icon="📦" variant="ok">
      Ship your app and its runtime deps — <strong>nothing else</strong>. No shell,
      no package manager, fewer libraries → fewer CVEs and nothing to pivot through.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Run as non-root" icon="🙅" variant="ok">
      A <code>USER</code> in the image (or a <code>nonroot</code> base). Cheapest
      single win: an escape lands as an unprivileged UID, not root.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Multi-stage, no secrets in layers" icon="🧅" variant="ok">
      Build fat, ship thin — the toolchain <em>and</em> build secrets stay in a
      discarded stage. A deleted file in a later layer is <strong>not</strong> gone.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Pin by digest, scan, sign" icon="🔏" variant="ok">
      Reference exact bytes by <code>@sha256:…</code>; scan for known CVEs; sign so
      consumers can verify provenance. Prove <em>what</em> you shipped and <em>where</em> it came from.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-5 kw-muted text-sm">

These are all things you do at **build time**. Kubernetes enforces the runtime
half later — Pod Security Standards, NetworkPolicy, admission (S17/S25).

</div>

<!--
Speaker: these map one-to-one onto the magic-move's fix-per-step. Frame scanners
and signers as categories, not products — you name examples next, not endorsements.
-->

---
layout: code-walkthrough
heading: 'Harden it — one fix per step'
lab: labs/day-1/02-container-security.md
---

````md magic-move
```dockerfile
# BEFORE: fat base, secret in a layer, runs as root
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# FIX 1 — multi-stage: the toolchain never reaches the final image
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
# CGO off → a static binary that runs on a tiny base
RUN CGO_ENABLED=0 go build -o /bin/app .

# a fresh, clean final stage — inherits nothing it isn't handed
FROM alpine:3.20
COPY --from=build /bin/app /bin/app
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 2 — mount the secret; it's used, never written to any layer
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM alpine:3.20
COPY --from=build /bin/app /bin/app
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 3 — distroless + non-root: no shell, no package manager, unprivileged UID
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM gcr.io/distroless/static:nonroot
COPY --from=build /bin/app /bin/app
USER 65532:65532
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# syntax=docker/dockerfile:1
# FIX 4 — pin the base by digest: exact bytes, not a movable tag
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

FROM gcr.io/distroless/static:nonroot@sha256:5759d19...   # pinned base
COPY --from=build /bin/app /bin/app
USER 65532:65532
ENTRYPOINT ["/bin/app"]
```
````

<!--
Speaker: one fix per step, mirroring the four moves. CGO_ENABLED=0 makes the Go
binary static so it runs on alpine/distroless (no libc). FIX 2 needs the
`# syntax=docker/dockerfile:1` directive for `--mount=type=secret` (BuildKit).
FIX 3's distroless/static:nonroot ships no shell — you can't `exec sh` into it,
which is the point. The digest in FIX 4 is illustrative — the lab has them fetch
the real one. This "after" image is what the lab scans against the "before".
-->

---
layout: code-annotated
heading: 'A deleted layer still ships'
compact: true
---

```bash {none|1|2|3|4}
COPY deploy_key /src/deploy_key   # layer N — secret is in the image
RUN rm /src/deploy_key            # layer N+1 — hidden, not erased

docker history --no-trunc demo:insecure
docker save demo:insecure -o img.tar && tar xf img.tar
```

::notes::

<CodeNote at="1" label="the layer that adds it" variant="danger">
Adding the file creates a layer whose content <strong>is</strong> the secret. That
layer is now part of the image's identity.
</CodeNote>

<CodeNote at="2" label="rm doesn't rewrite history" variant="warn">
A later layer records a <em>whiteout</em> that hides the file from the final
filesystem — but layer N, with the secret, is <strong>still there and pullable</strong>.
</CodeNote>

<CodeNote at="3" label="history reveals it">
<code>history</code> lists every layer and the instruction that built it. The
<code>COPY deploy_key</code> layer is visible to anyone with the image.
</CodeNote>

<CodeNote at="4" label="the real fix" variant="ok">
You can't delete your way out — you must never <strong>add</strong> the secret to
a shipped layer. Build-time secret mounts (FIX 2) or a discarded build stage are
the only real fixes. The lab proves this end to end.
</CodeNote>

<!--
Speaker: this is the single most expensive beginner mistake in this section. The
mental hook: layers are append-only; `rm` is a new layer, not an edit. Rotate any
secret that ever touched a shipped layer — assume it's public.
-->

---
layout: two-cols-code
heading: 'Scan before and after — sell the drop'
lab: labs/day-1/02-container-security.md
---

````md magic-move
```text
# demo:insecure  (fat base + toolchain)
Total: 61 (UNKNOWN: 0, LOW: 18, MEDIUM: 27, HIGH: 14, CRITICAL: 2)

  ├─ os-pkgs   glibc, openssl, bash …   fixable + unfixable
  └─ go-mod    stdlib pinned to 1.24
```

```text
# demo:hardened  (distroless/static:nonroot)
Total: 0 (UNKNOWN: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0)

  └─ scanner found no OS packages and no known-vulnerable modules
```
````

::right::

<div class="text-sm">

A scanner (**e.g. Trivy, Grype**) reads the image's package metadata and matches it
against CVE feeds — OS packages **and** language dependencies.

<div class="mt-3">
<KwChip variant="warn">HIGH / CRITICAL first</KwChip>
<KwChip>fixable vs unfixable</KwChip>
<KwChip variant="ok">gate CI on severity</KwChip>
</div>

<div class="mt-4 kw-muted">

Counts are **illustrative and move daily** — the number that matters is the
**delta**: a minimal base has almost nothing to find. Wire the scan into CI so a
regression fails the build.

</div>

</div>

<!--
Speaker: don't memorize numbers — DBs update constantly (currency guardrail). The
teaching point is relative: fat base = dozens of findings you didn't write;
distroless = near-zero because there are barely any packages. Tools named as
examples, not endorsements. The lab has them run the real before/after.
-->

---

<span class="kw-kicker">Know what's inside — and prove where it came from</span>

# SBOM, signing, and provenance

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="SBOM" icon="📋">
      A <strong>bill of materials</strong> — every package and version in the image,
      as <strong>SPDX</strong> or <strong>CycloneDX</strong>. Generated at build
      (e.g. Syft). When the next CVE drops, you grep your SBOMs instead of guessing.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Sign & verify" icon="✍️">
      Sign the image by <strong>digest</strong> (e.g. cosign / Sigstore); consumers
      <code>verify</code> before running. A tampered or unsigned image
      <strong>fails the check</strong> — trust becomes enforceable.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Provenance / SLSA" icon="🧾" variant="plain">
      A signed <strong>attestation</strong> of <em>how</em> the image was built
      (source, builder, steps). <strong>SLSA</strong> levels grade that chain from
      "trust me" to "independently verifiable".
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 text-sm">

All three hang off one thing: the **digest**. `app:1.4` can move; `app@sha256:…`
can't — so it's what you scan, sign, attest, and finally **deploy**.

</div>

<!--
Speaker: SBOM answers "am I affected?" fast; signing answers "is this really our
image?"; provenance answers "how was it built?". Mental-model depth only — the lab
does SBOM for real and demos sign/verify as expected output. Enforcement (only
admit signed images) is S17/S25.
-->

---
layout: recap
heading: 'Build-time security, in one arc'
story: 'The on-call page wasn''t a runtime exploit — it was a bloated image that still carried a build secret in layer history.'
next: 'S03 — the Kubernetes mental model: control plane, nodes, reconciliation'
---

- **Minimal / distroless base** → fewer packages, fewer CVEs, nothing to pivot through
- **Non-root `USER`** → an escape lands unprivileged, not as root on the node
- **Multi-stage + secret mounts** → toolchains and secrets never reach a shipped layer
- **A deleted layer still ships** → never *add* a secret; rotate anything that did
- **Scan, SBOM, sign, pin by digest** → know what's inside and prove where it came from

<div class="mt-4 kw-muted text-sm">

This is the **build-time** half. Kubernetes enforces the **runtime** half later —
Pod Security Standards + NetworkPolicy (**S17**), the pod-escape walkthrough
(**S25**), and the production-readiness checklist (**S26**). CKx: security
foundations — image hygiene precedes runtime hardening.

</div>

<!--
Speaker: close the loop opened in S01 ("S02 goes deeper"). The Gremlin/threat
that Day 3 hunts is first a stowaway in a bloated image — that's the through-line
from here to S25.
-->

---
layout: lab
lab: labs/day-1/02-container-security.md
duration: 25 min
env: local — no cluster needed
---

## Lab 02 — Scan & harden an image

- **Scan** a deliberately vulnerable image and record the HIGH/CRITICAL count
- **Harden it:** minimal base + non-root `USER` + multi-stage → **re-scan** and compare
- **SBOM:** generate one for the hardened image and find a dependency in it
- **Break it on purpose:** bake a secret, recover it from image history, then remove it *correctly*
- **Sign & pin:** (optional) sign/verify, then pin the final reference by **digest**

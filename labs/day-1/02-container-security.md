# Lab 02 — Scan & harden a container image (S02)

| | |
| --- | --- |
| **Section** | S02 — Container security & supply chain |
| **Environment** | local — no cluster needed |
| **Estimated time** | 25 min |

## Objective

Take a deliberately careless image — fat base, running as **root**, with a **secret baked into a
layer** — and measure how bad it is. Then harden it in one pass (minimal base + non-root +
multi-stage), and **re-measure**: scan CVEs before/after, generate an **SBOM**, prove that a
"deleted" secret is still recoverable, and finally **pin by digest**. By the end you can defend
every image you ship with numbers, not vibes.

This is the build-time half of security. Day 3 (S17/S25) enforces the runtime half.

## Prerequisites

- A **container engine**: Docker, Podman, or nerdctl. **No cluster, no `kubectl`.**
- The engine's daemon/machine running (`docker info` returns without error).
- A **vulnerability scanner**: [Trivy](https://trivy.dev) (`trivy version` works). Grype is a fine
  substitute — commands are noted where they differ.
- Internet access on first run: the engine pulls base images and Trivy downloads its CVE database.
- **Optional** (Step 6 only): [cosign](https://docs.sigstore.dev/) for signing. Skippable.

> **Which engine?** Every command uses `$ENGINE` so it works for all three. Set it once:
> ```bash
> export ENGINE=docker      # or: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
> `--mount=type=secret` and `--secret` (Step 3) are BuildKit features — on Docker they're on by
> default; Podman and nerdctl support the same `--secret` flag.

## Files used

All created inline in Step 1 (nothing to download):

- `app/main.go`, `app/go.mod` — the tiny HTTP server from Lab 01 (stdlib only).
- `app/deploy_key` — a **fake** build secret with a searchable marker.
- `app/Dockerfile.insecure` — fat base, root, secret COPYed into a layer.
- `app/Dockerfile.secret-rm` — the naive "just `rm` the secret" attempt (Step 5).
- `app/Dockerfile.hardened` — multi-stage, distroless, non-root, secret **mounted** not copied.

---

## Step 1 — create the project

Paste this whole block. It makes an `app/` folder with the source, a fake secret, and three
Dockerfiles.

```bash
mkdir -p app && cd app

cat > main.go <<'EOF'
package main

import (
	"fmt"
	"net/http"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		host, _ := os.Hostname()
		fmt.Fprintf(w, "hello from %s\n", host)
	})
	fmt.Println("listening on :" + port)
	http.ListenAndServe(":"+port, nil)
}
EOF

cat > go.mod <<'EOF'
module demo

go 1.24
EOF

# a FAKE secret — note the searchable marker; we grep for it later
cat > deploy_key <<'EOF'
-----BEGIN DEMO KEY-----
DEPLOY-SECRET-DO-NOT-SHIP-abc123
-----END DEMO KEY-----
EOF

cat > Dockerfile.insecure <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.secret-rm <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
COPY deploy_key /src/deploy_key
RUN go build -o /bin/app .
RUN rm -f /src/deploy_key
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.hardened <<'EOF'
# syntax=docker/dockerfile:1
# stage 1: build with the toolchain; the secret is MOUNTED, never copied to a layer
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN --mount=type=secret,id=deploy_key \
    DEPLOY_KEY="$(cat /run/secrets/deploy_key)" CGO_ENABLED=0 go build -o /bin/app .

# stage 2: distroless + non-root; no shell, no package manager
FROM gcr.io/distroless/static:nonroot
COPY --from=build /bin/app /bin/app
ENV PORT=8080
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/bin/app"]
EOF

ls
```

**Task:** confirm all six files exist.

<details><summary>Solution / expected output</summary>

```console
$ ls
Dockerfile.hardened  Dockerfile.insecure  Dockerfile.secret-rm  deploy_key  go.mod  main.go
```

You are now inside `app/`. Every later command runs from here. The `deploy_key` is fake — it only
carries the marker `DEPLOY-SECRET-DO-NOT-SHIP-abc123` so you can grep for it.
</details>

---

## Step 2 — build the careless image and measure it

Build the insecure image, confirm it runs as **root**, then scan it and **write down the numbers**.

```bash
$ENGINE build -f Dockerfile.insecure -t demo:insecure .
$ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'   # empty = root
trivy image --severity HIGH,CRITICAL demo:insecure
```

**Task:** the `user=[]` field is empty (root), and Trivy prints a table ending in a `Total:` line.
Record the HIGH and CRITICAL counts.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'
user=[]                 # no USER set → the container runs as root (UID 0)

$ trivy image --severity HIGH,CRITICAL demo:insecure
demo:insecure (debian 12.x)
Total: 41 (HIGH: 38, CRITICAL: 3)
...
```

**Your numbers will differ** — CVE databases update daily, so the exact totals move. That's the
point of recording them: you're capturing a baseline to beat, not a magic number. The findings come
almost entirely from the **fat Debian base + Go toolchain** you shipped, not from your six-line app.

> Grype user? `grype demo:insecure` prints an equivalent table; filter with `grype demo:insecure -o table | grep -E 'High|Critical'`.
</details>

**Question:** you wrote zero lines of C and your app is pure Go stdlib. Why does the scanner find
dozens of OS-package CVEs?

<details><summary>Answer</summary>

Because an image is your app **plus its entire base**. `golang:1.24` is a full Debian userland —
glibc, openssl, coreutils, a shell, a package manager — and every one of those packages carries its
own CVE history. You inherit all of it the moment you write `FROM golang:1.24` and ship that image.
Shrinking the base (next step) is the highest-leverage fix because it deletes whole categories of
findings at once.
</details>

---

## Step 3 — harden it and re-measure

Build the hardened image. The secret is **mounted** (never written to a layer), the binary is
**static** (`CGO_ENABLED=0`) so it runs on a tiny base, and the final stage is **distroless +
non-root**.

```bash
# --secret feeds the file to the build without baking it into any layer
$ENGINE build -f Dockerfile.hardened --secret id=deploy_key,src=deploy_key -t demo:hardened .

$ENGINE image inspect demo:hardened --format 'user=[{{.Config.User}}]'   # 65532 = non-root
$ENGINE images demo                                                       # compare sizes
trivy image --severity HIGH,CRITICAL demo:hardened
```

**Task:** the hardened image runs as UID **65532**, is dramatically smaller, and its HIGH/CRITICAL
count drops to **near zero**. Compare against the numbers you wrote down in Step 2.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE image inspect demo:hardened --format 'user=[{{.Config.User}}]'
user=[65532:65532]

$ $ENGINE images demo
REPOSITORY   TAG        IMAGE ID       SIZE
demo         hardened   a1b2c3...      ~9MB
demo         insecure   d4e5f6...      ~860MB

$ trivy image --severity HIGH,CRITICAL demo:hardened
demo:hardened (distroless)
Total: 0 (HIGH: 0, CRITICAL: 0)
```

Three fixes, compounding:
- **Multi-stage** — the toolchain stays in the `build` stage and is discarded (~860 MB → ~9 MB).
- **Distroless static base** — almost no OS packages means almost nothing for the scanner to flag.
- **Non-root `USER 65532`** — an escape from this container lands as an unprivileged UID, not root.

The exact "after" total may not be a perfect 0 forever (a future CVE could land in the base), but it
will always be a fraction of the fat-base number.
</details>

**Question:** try to open a shell in the hardened image: `$ENGINE run --rm -it demo:hardened sh`.
Why does it fail — and why is that a **good** thing?

<details><summary>Answer</summary>

```console
$ $ENGINE run --rm -it demo:hardened sh
docker: Error response from daemon: exec: "sh": executable file not found in $PATH
```

`distroless/static` ships **no shell and no package manager** — there is no `sh`, no `apt`, no
`curl`. That's a feature: if an attacker gets code execution inside the container, they have no
tools to pivot with. It also means you debug distroless images from the outside (`kubectl debug`,
ephemeral containers) rather than by shelling in — a habit S25 relies on.
</details>

---

## Step 4 — generate an SBOM

An SBOM (Software Bill of Materials) lists every component in the image. When the next big CVE
drops, you search your SBOMs instead of rebuilding and rescanning everything.

```bash
# Trivy can emit a CycloneDX SBOM; --format spdx-json is the SPDX alternative
trivy image --format cyclonedx --output sbom.json demo:hardened
wc -l sbom.json
grep -o '"name":"[^"]*"' sbom.json | head
```

**Task:** `sbom.json` exists and lists named components. Find at least one dependency in it.

<details><summary>Solution / expected output</summary>

```console
$ trivy image --format cyclonedx --output sbom.json demo:hardened
$ grep -o '"name":"[^"]*"' sbom.json | head
"name":"demo:hardened"
"name":"base-files"
"name":"tzdata"
"name":"stdlib"
```

`stdlib` is the Go standard library your binary was built against — the SBOM records **its exact
version**, so if a Go stdlib CVE is announced you can answer "are we affected?" by grepping this
file. Formats: **CycloneDX** (used here) and **SPDX** are the two open standards; auditors and
policy tools consume either.

> Prefer Syft? `syft demo:hardened -o cyclonedx-json > sbom.json` produces an equivalent document.
</details>

**Question:** why keep an SBOM at all when you can just re-scan the image whenever you want?

<details><summary>Answer</summary>

Re-scanning needs the image **and** a working scanner **and** an up-to-date DB, run against every
image you've ever shipped — slow, and impossible once an image is gone from your registry. An SBOM
is a small text artifact you store next to the build. When `CVE-2025-xxxx in libfoo` hits, you
`grep libfoo` across thousands of stored SBOMs in seconds to find exactly which releases are
affected — no images, no scanner, no rebuild.
</details>

---

## Step 5 — break it on purpose: a "deleted" secret still ships

The naive fix for a baked-in secret is to `rm` it in a later step. Prove that doesn't work.

```bash
$ENGINE build -f Dockerfile.secret-rm -t demo:secret-rm .
$ENGINE run --rm demo:secret-rm ls /src/deploy_key   # gone from the final filesystem?
$ENGINE history --no-trunc demo:secret-rm | grep -i deploy_key
```

**Task:** the file is absent from the running container, **but** `history` still shows the layer
that added it.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE run --rm demo:secret-rm ls /src/deploy_key
ls: cannot access '/src/deploy_key': No such file or directory

$ $ENGINE history --no-trunc demo:secret-rm | grep -i deploy_key
<id>  2 minutes ago  COPY deploy_key /src/deploy_key # buildkit   77B
```

The final filesystem doesn't show the file — the `RUN rm` layer records a **whiteout** that hides
it. But layers are **append-only**: the earlier `COPY deploy_key` layer, secret and all, is still
part of the image.
</details>

Now actually recover the secret from the image — no whiteout can stop this:

```bash
mkdir -p /tmp/dig && $ENGINE save demo:secret-rm | tar -x -C /tmp/dig
# layer blobs may be plain OR gzipped depending on the engine — handle both:
find /tmp/dig -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" | head -1
```

**Task:** the marker string is recovered straight out of the saved image's layer blobs.

> **Engine note:** Docker's classic image store writes **uncompressed** layer tars, so a plain
> `grep -ra /tmp/dig` also finds it. The containerd store and `nerdctl save` may **gzip** the blobs —
> the `gzip -dc … || cat` above handles both. If you ever see "not found" here, suspect compression,
> not safety.

<details><summary>Solution / expected output</summary>

```console
$ find /tmp/dig -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
    | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" | head -1
DEPLOY-SECRET-DO-NOT-SHIP-abc123
```

Anyone who can pull the image can do exactly this. **Deleting a file in a later layer does not remove
it from the image** — the bytes live forever in the layer that added them. The only real fixes are to
never put the secret in a shipped layer: a build-time **secret mount** (what `Dockerfile.hardened`
does) or copying it only into a **discarded build stage**.
</details>

Now prove the hardened image is clean — same recovery, no hit:

```bash
mkdir -p /tmp/dig2 && $ENGINE save demo:hardened | tar -x -C /tmp/dig2
find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
```

<details><summary>Solution / expected output</summary>

```console
$ find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
    | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
NOT FOUND — clean
```

(`grep` exits non-zero when it finds nothing, so the `|| echo` fires. Don't pipe the final `grep`
through `head` — that would swallow grep's exit code and the message would never print.)

The secret was mounted at `/run/secrets/deploy_key` **only during the `RUN`** in the build stage —
it was never written to a layer, and the build stage itself is discarded. The shipped image has no
trace of it.
</details>

**Question:** you accidentally shipped `demo:secret-rm` to a registry last week, then rebuilt it
"clean" today. Is the secret safe now?

<details><summary>Answer</summary>

No. Assume it is **compromised and must be rotated.** Anyone who pulled the old image still has the
layer with the key, and registries may retain old digests. Rebuilding today doesn't unpublish
yesterday's bytes. The only safe response to a secret that ever touched a shipped layer is to
**revoke and rotate it**, then rebuild without it.
</details>

---

## Step 6 — (optional) sign & verify

Signing lets a consumer prove an image is really yours and untampered. This needs **cosign** and a
registry to push to; skip it if either is missing — read the expected output instead.

```bash
# one-time: a local registry to push to, and a keypair
$ENGINE run -d -p 5000:5000 --name lab-registry registry:2
cosign generate-key-pair                        # writes cosign.key / cosign.pub

$ENGINE tag demo:hardened localhost:5000/demo:hardened
$ENGINE push localhost:5000/demo:hardened
# the local registry is plain HTTP, so cosign needs --allow-insecure-registry
cosign sign --key cosign.key --allow-insecure-registry localhost:5000/demo:hardened
cosign verify --key cosign.pub --allow-insecure-registry localhost:5000/demo:hardened
```

**Task:** `verify` succeeds for the signed image; if you push a *different* image to the same tag,
`verify` fails.

<details><summary>Solution / expected output</summary>

```console
$ cosign verify --key cosign.pub --allow-insecure-registry localhost:5000/demo:hardened
Verification for localhost:5000/demo:hardened --
The following checks were performed on the signatures:
  - The signatures were verified against the specified public key
[{"critical":{"identity":{...},"image":{"docker-manifest-digest":"sha256:..."}}}]

# tamper: overwrite the tag with the insecure image, re-verify
$ $ENGINE tag demo:insecure localhost:5000/demo:hardened
$ $ENGINE push localhost:5000/demo:hardened
$ cosign verify --key cosign.pub localhost:5000/demo:hardened
Error: no matching signatures:
...
```

The signature is bound to the image's **digest**, not its tag. Move the tag to different bytes and
the signature no longer matches — `verify` fails closed. In S17/S25 an **admission controller** runs
this same `verify` at deploy time and refuses unsigned or tampered images.
</details>

**Question (no tools needed):** the signature covers the digest, not the tag. Why does that matter?

<details><summary>Answer</summary>

Because tags are mutable — `demo:hardened` can be repointed to any bytes at any time. A signature
over the **digest** pins trust to exact content: if a single byte changes, the digest changes, and
the old signature stops matching. This is why every trustworthy supply-chain step (sign, attest,
admit, deploy) keys off the digest, never the tag.
</details>

---

## Step 7 — pin the final reference by digest

A tag can move; a **digest** names exact bytes. Grab the hardened image's content digest and run it
by digest.

```bash
DIGEST=$($ENGINE image inspect demo:hardened --format '{{.Id}}')   # sha256:... (content digest)
echo "$DIGEST"
$ENGINE run -d --name demo-pin -p 8080:8080 "$DIGEST"              # run it by digest, not tag
curl -s localhost:8080
$ENGINE rm -f demo-pin
```

**Task:** the image runs when referenced purely by its `sha256:` digest, and `curl` answers.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE image inspect demo:hardened --format '{{.Id}}'
sha256:5759d19f...e41
```

Running by that digest starts the **exact** image you built and scanned — no tag lookup, no
ambiguity. In production you pin the **registry** digest, which you read from `RepoDigests` after a
push:

```console
$ $ENGINE image inspect demo:hardened --format '{{index .RepoDigests 0}}'
localhost:5000/demo@sha256:...
```

and deploy `image: localhost:5000/demo@sha256:...` in your Pod spec. That guarantees every node pulls
the bytes you tested — the reproducibility a floating tag can never promise.
</details>

**Question:** if you pin by digest in your Deployment, what do you give up compared to `image: demo:1.4`?

<details><summary>Answer</summary>

Automatic pickup of new pushes. With a tag, re-pushing `demo:1.4` and restarting Pods pulls the new
image; with a digest, the reference is frozen until **you** change it. That's the trade: digests buy
reproducibility and integrity at the cost of an explicit update step — which is exactly what you want
for anything you need to audit or roll back precisely. (GitOps in S21 automates bumping the pinned
digest.)
</details>

---

## Expected observations

- The **insecure** image runs as **root** and scans with **dozens** of HIGH/CRITICAL findings, almost
  all from the fat base — not your code.
- The **hardened** image is **~90× smaller**, runs as **UID 65532**, has **no shell**, and scans to
  **near-zero** HIGH/CRITICAL.
- An **SBOM** lists real components (e.g. the Go `stdlib` version) you can grep against future CVEs.
- A secret `rm`'d in a later layer is **still recoverable** from `demo:secret-rm`; the **mounted**
  secret leaves **no trace** in `demo:hardened`.
- (Optional) `cosign verify` **succeeds** for the signed digest and **fails** after tampering.
- The hardened image runs when referenced by its **`sha256:` digest**.

---

## Cleanup / panic reset

Everything lived in `app/`, a few images, and (optionally) a local registry — no cluster touched.

```bash
# stop & remove the optional local registry (ignore if you skipped Step 6)
$ENGINE rm -f lab-registry 2>/dev/null || true

# remove the images this lab built
$ENGINE rmi -f demo:insecure demo:secret-rm demo:hardened localhost:5000/demo:hardened 2>/dev/null || true

# remove extracted layers, generated artifacts, and the project
rm -rf /tmp/dig /tmp/dig2 && cd .. && rm -rf app
```

<details><summary>Panic reset — reclaim everything this lab created</summary>

If images or the registry container linger:

```console
$ $ENGINE rm -f lab-registry
$ $ENGINE image prune -f          # remove dangling (untagged) layers
$ rm -f cosign.key cosign.pub     # if you ran Step 6
```

Nothing here is namespaced or shared — it's all local to your machine, so a full prune is safe.
</details>

## Stretch (optional)

The distroless base still showed a couple of components in the SBOM. Try
`gcr.io/distroless/static-debian12:nonroot` vs building `FROM scratch` (copy only the static binary
and a CA bundle). Scan and SBOM both — how close to a truly empty bill of materials can you get, and
what breaks (TLS, timezones) when you go all the way to `scratch`?

<details><summary>Solution / expected output</summary>

`FROM scratch` with just the binary yields an SBOM with essentially **one component** (your binary)
and a scan of **0** — but you lose the CA certificates (HTTPS calls fail with x509 errors) and
`/etc/passwd`/timezone data. Distroless exists precisely to add that minimal, non-root runtime
scaffolding back without dragging in a shell or package manager:

```console
# scratch: copy the CA bundle yourself or TLS breaks
FROM scratch
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /bin/app /bin/app
USER 65532
ENTRYPOINT ["/bin/app"]
```

The lesson: smaller is safer until it's broken — distroless is the pragmatic floor for most apps.
</details>

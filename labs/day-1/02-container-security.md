# Lab 02 — Scan & harden a container image (S02)

<!-- lab-contract:v1 -->

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
>
> ```bash
> export ENGINE=docker      # or: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
>
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

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./02-container-security.solution.md#guided-solutions)

### Step 1 — create the project

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

---

### Step 2 — build the careless image and measure it

Build the insecure image, confirm it runs as **root**, then scan it and **write down the numbers**.

```bash
$ENGINE build -f Dockerfile.insecure -t demo:insecure .
$ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'   # empty = root
trivy image --severity HIGH,CRITICAL demo:insecure
```

**Task:** the `user=[]` field is empty (root). Record the HIGH and CRITICAL counts **and
the names above each result table**. The toolchain image can report the same Go finding for
the app, compiler, formatter, and build tools, while the OS-package table changes whenever
the vulnerability database or base tag changes.

**Question:** you wrote a tiny Go app. Why does the scanner inspect so many binaries and
OS packages that your runtime never calls?

---

### Step 3 — harden it and re-measure

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

**Task:** the hardened image runs as UID **65532**, is dramatically smaller, and Trivy now
has far fewer components and result tables to inspect. Compare the **affected components**,
not just the headline count: the compiled app can retain the same Go stdlib findings until
it is rebuilt with a fixed Go release. A small image is reduced attack surface, not proof of
zero vulnerabilities.

**Question:** try to open a shell in the hardened image: `$ENGINE run --rm -it demo:hardened sh`.
Why does it fail — and why is that a **good** thing?

---

### Step 4 — generate an SBOM

An SBOM (Software Bill of Materials) lists every component in the image. When the next big CVE
drops, you search your SBOMs instead of rebuilding and rescanning everything.

```bash
# Trivy can emit a CycloneDX SBOM; --format spdx-json is the SPDX alternative
trivy image --format cyclonedx --output sbom.json demo:hardened
wc -l sbom.json
grep -o '"name":"[^"]*"' sbom.json | head
```

**Task:** `sbom.json` exists and lists named components. Find at least one dependency in it.

**Question:** why keep an SBOM at all when you can just re-scan the image whenever you want?

---

### Step 5 — break it on purpose: a "deleted" secret still ships

The naive fix for a baked-in secret is to `rm` it in a later step. Prove that doesn't work.

```bash
$ENGINE build -f Dockerfile.secret-rm -t demo:secret-rm .
$ENGINE run --rm demo:secret-rm ls /src/deploy_key   # gone from the final filesystem?
$ENGINE history --no-trunc demo:secret-rm | grep -i deploy_key
```

**Task:** the file is absent from the running container, **but** `history` still shows the layer
that added it.

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

Now prove the hardened image is clean — same recovery, no hit:

```bash
mkdir -p /tmp/dig2 && $ENGINE save demo:hardened | tar -x -C /tmp/dig2
find /tmp/dig2 -type f -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -a "DEPLOY-SECRET-DO-NOT-SHIP" || echo "NOT FOUND — clean"
```

**Question:** you accidentally shipped `demo:secret-rm` to a registry last week, then rebuilt it
"clean" today. Is the secret safe now?

---

### Step 6 — (optional) sign & verify

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

**Question (no tools needed):** the signature covers the digest, not the tag. Why does that matter?

---

### Step 7 — pin the final reference by digest

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

**Question:** if you pin by digest in your Deployment, what do you give up compared to `image: demo:1.4`?

---

## Observe

- The **insecure** image runs as **root** and makes Trivy inspect the application plus the
  compiler, formatter, build tools, and hundreds of base packages.
- The **hardened** image is dramatically smaller, runs as **UID 65532**, and has no shell or
  toolchain. Its app may still report Go stdlib findings until rebuilt with a fixed compiler.
- An **SBOM** lists real components (e.g. the Go `stdlib` version) you can grep against future CVEs.
- A secret `rm`'d in a later layer is **still recoverable** from `demo:secret-rm`; the **mounted**
  secret leaves **no trace** in `demo:hardened`.
- (Optional) `cosign verify` **succeeds** for the signed digest and **fails** after tampering.
- The hardened image runs when referenced by its **`sha256:` digest**.

---

## Challenge

The distroless base still showed a couple of components in the SBOM. Try
`gcr.io/distroless/static-debian12:nonroot` vs building `FROM scratch` (copy only the static binary
and a CA bundle). Scan and SBOM both — how close to a truly empty bill of materials can you get, and
what breaks (TLS, timezones) when you go all the way to `scratch`?

**Difficulty:** Advanced

**Success criteria:** Build both distroless and scratch variants, scan each image,
generate an SBOM for each, run each by digest, and explain which runtime files scratch
needs for HTTPS.

**Hints:** Reuse the existing builder stage; copy the binary and CA bundle into scratch,
then compare `trivy image`, CycloneDX SBOM, and runtime HTTP results side by side.

[Spoiler: challenge solution](./02-container-security.solution.md#challenge-solution)

## Verify

Prove the hardened artifact is non-root and that the fake secret is absent before cleanup.

```bash
$ENGINE image inspect demo:hardened --format 'user={{.Config.User}}'
rm -rf /tmp/hardened-layers && mkdir -p /tmp/hardened-layers
$ENGINE save demo:hardened | tar -x -C /tmp/hardened-layers
if find /tmp/hardened-layers -type f \
  -exec sh -c 'gzip -dc "$1" 2>/dev/null || cat "$1"' _ {} \; \
  | grep -aq 'DEPLOY-SECRET-DO-NOT-SHIP'; then
  echo "secret leaked into hardened image" >&2
  exit 1
fi
trivy image --severity HIGH,CRITICAL demo:hardened
```

Expected: user `65532`, no secret match, and far fewer installed/affected components than
the careless image. The remaining app findings are real and must not be described as zero.

## Cleanup / reset

Everything lived in `app/`, a few images, and (optionally) a local registry — no cluster touched.

```bash
# stop & remove the optional local registry (ignore if you skipped Step 6)
$ENGINE rm -f lab-registry 2>/dev/null || true

# remove the images this lab built
$ENGINE rmi -f demo:insecure demo:secret-rm demo:hardened demo:distroless demo:scratch \
  localhost:5000/demo:hardened 2>/dev/null || true

# remove extracted layers, generated artifacts, and the project
rm -f sbom.json sbom-distroless.json sbom-scratch.json
rm -rf /tmp/dig /tmp/dig2 /tmp/hardened-layers && cd .. && rm -rf app
```

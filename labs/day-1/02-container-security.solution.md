# Lab 02 — Scan & harden a container image (S02) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

<details><summary>Solution / expected output</summary>

```console
$ ls
Dockerfile.hardened  Dockerfile.insecure  Dockerfile.secret-rm  deploy_key  go.mod  main.go
```

You are now inside `app/`. Every later command runs from here. The `deploy_key` is fake — it only
carries the marker `DEPLOY-SECRET-DO-NOT-SHIP-abc123` so you can grep for it.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE image inspect demo:insecure --format 'user=[{{.Config.User}}]'
user=[]                 # no USER set → the container runs as root (UID 0)

$ trivy image --severity HIGH,CRITICAL demo:insecure
usr/bin/app (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)

usr/local/go/bin/go (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)

... additional compiler and toolchain binaries ...
```

This excerpt is from the real 2026-08-03 replay with Trivy 0.73.0. Your findings will
differ as databases and mutable base tags move. Record both the totals and the affected
binaries: the fat image retains the complete Go toolchain in production.

> Grype user? `grype demo:insecure` prints an equivalent table; filter with `grype demo:insecure -o table | grep -E 'High|Critical'`.
</details>

**Question:** you wrote a tiny Go app. Why does the scanner inspect so many binaries and
OS packages that your runtime never calls?

<details><summary>Answer</summary>

Because an image is your app **plus its entire base**. `golang:1.24` is a full Debian
userland and also contains the compiler, formatter, and build tools. Trivy inventories all
of them. Shrinking the runtime base deletes whole categories of unnecessary software, but
it cannot repair a vulnerable standard library already compiled into your app.
</details>

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

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE image inspect demo:hardened --format 'user=[{{.Config.User}}]'
user=[65532:65532]

$ $ENGINE images demo
REPOSITORY   TAG        IMAGE ID       SIZE
demo         hardened   a1b2c3...      ~9MB
demo         insecure   d4e5f6...      ~860MB

$ trivy image --severity HIGH,CRITICAL demo:hardened
usr/bin/app (gobinary)
Total: 12 (HIGH: 12, CRITICAL: 0)
```

Three fixes, compounding:

- **Multi-stage** — the toolchain stays in the `build` stage and is discarded (~860 MB → ~9 MB).
- **Distroless static base** — no package manager, shell, compiler, or build utilities remain.
- **Non-root `USER 65532`** — an escape from this container lands as an unprivileged UID, not root.

This is the same 2026-08-03 replay. The application was compiled with the same vulnerable
Go stdlib, so its twelve findings remain. The improvement is one affected application
binary instead of the same findings repeated across many shipped build binaries. Rebuild
with a fixed Go release to remove them.
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

### Step 5 — break it on purpose: a "deleted" secret still ships

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

## Expected state

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

## Troubleshooting and recovery

If BuildKit rejects `--secret`, confirm your engine supports
BuildKit and rerun the exact hardened build command. If optional signing leaves a registry
behind, remove only `lab-registry`; never prune unrelated images or volumes.

## Challenge solution

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

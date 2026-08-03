# Lab 01 — Build & inspect a container image (S01)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S01 — Containers |
| **Environment** | local — no cluster needed |
| **Estimated time** | 25 min |

## Objective

Build a container image from a Dockerfile, run it, look **inside** it, and read the **layers**
it's made of. By the end, an image is no longer magic: it's an ordered stack of layers, run as
an ordinary (non-root) process. You'll also feel two things beginners trip on — build **caching**
and the `latest` **tag** — by breaking them on purpose.

## Prerequisites

- A **container engine** on your machine: Docker, Podman, or nerdctl. **No cluster, no `kubectl`.**
- The engine's daemon/machine running (`docker info` — or `podman info` — returns without error).
- A terminal you can copy-paste into. Lab 00 is not required for this one.

> **Which engine?** Every command below uses `$ENGINE` so it works for all three. Set it once:
>
> ```bash
> export ENGINE=docker      # or: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
>
> Podman and nerdctl are near drop-in replacements for the `docker` CLI used here.

## Files used

All created inline in Step 1 (nothing to download):

- `app/main.go` — a tiny HTTP server that prints its hostname.
- `app/go.mod` — the Go module file (stdlib only, no dependencies).
- `app/Dockerfile` — single-stage build (matches the slide walkthrough).
- `app/Dockerfile.multistage` — the thin, multi-stage version for Step 6.

---

## Guided task

Work through the steps without opening the companion unless you are blocked. The spoiler
contains exact commands, expected state, explanations, and recovery guidance.

[Spoiler: guided solutions and expected output](./01-containers.solution.md#guided-solutions)

### Step 1 — create the project

Paste this whole block. It makes an `app/` folder with the source and both Dockerfiles.

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

cat > Dockerfile <<'EOF'
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
RUN useradd -u 10001 app
USER 10001
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

cat > Dockerfile.multistage <<'EOF'
# stage 1: build with the full toolchain
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
# CGO_ENABLED=0 produces a static binary that runs on a minimal base
RUN CGO_ENABLED=0 go build -o /bin/app .

# stage 2: ship only the binary
FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /bin/app /bin/app
ENV PORT=8080
USER 10001
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
EOF

ls
```

**Task:** confirm all four files exist.

---

### Step 2 — build and run

Build the image, tag it `demo:1`, then run it **detached** with the container port published to
your machine.

```bash
$ENGINE build -t demo:1 .
$ENGINE run -d --name demo -p 8080:8080 demo:1
$ENGINE ps
curl -s localhost:8080
```

**Task:** the build succeeds, `ps` shows the container `Up`, and `curl` prints a greeting.

**Question:** you published `-p 8080:8080`. Which number is the host's and which is the container's?

---

### Step 3 — look inside the running container

You don't have to trust the Dockerfile — verify the process is really **non-root**, and inspect it
from both inside and outside.

```bash
$ENGINE exec demo id                                     # who is the process?
$ENGINE top demo                                         # the process, seen from the host
$ENGINE image inspect demo:1 --format '{{.Config.User}}' # what the image declares
```

**Task:** all three agree the app runs as UID **10001**, not root.

**Task (optional interactive poke):** get a shell and look around, then exit.

---

### Step 4 — read the layers, then invalidate the cache

An image is an ordered stack of layers. List them, then change the source and watch which layers
**rebuild** versus come from **cache**.

```bash
$ENGINE history demo:1
```

**Question:** which layer holds your source code?

Now change the source and rebuild:

```bash
sed -i.bak 's/hello from/HELLO from/' main.go && rm -f main.go.bak
$ENGINE build -t demo:2 .
```

**Task:** in the second build, the early layers say **CACHED** but everything from `COPY . .`
downward is rebuilt.

---

### Step 5 — break it on purpose: `latest` is not "newest"

You never built a `latest` tag. Ask for one anyway and read the failure.

```bash
$ENGINE run --rm demo:latest
```

**Task:** this fails. Read the error, then fix it **two** ways.

**Question:** you just moved `demo:latest` to `demo:2`. If a teammate had `demo:latest` cached from
yesterday, would they get your new image?

---

### Step 6 — multi-stage: ship thin

Rebuild with the multi-stage Dockerfile, which discards the toolchain, then compare sizes.

```bash
$ENGINE build -f Dockerfile.multistage -t demo:slim .
$ENGINE images demo
```

**Task:** `demo:slim` is dramatically smaller than `demo:1`.

**Question:** why can the builder stage be huge without bloating the final image?

---

## Observe

- `$ENGINE build` produces `demo:1`; the container runs and `curl localhost:8080` answers.
- The process runs as **UID 10001**, confirmed inside (`id`), from the host (`top`), and in the
  image config (`.Config.User`).
- `history` shows the image as ordered layers; changing the source rebuilds **`COPY` and below**
  while earlier layers stay **CACHED**.
- `run demo:latest` **fails** until you tag or pin — proving `latest` guarantees nothing.
- The multi-stage `demo:slim` is **~40× smaller** than the single-stage image.

---

## Challenge

Prove the source really is baked into one layer: rebuild changing **only** `ENV PORT`, and confirm
the expensive `go build` layer is reused.

[Spoiler: challenge solution](./01-containers.solution.md#challenge-solution)

## Verify

Run these checks before removing the images. The first command proves the slim image is
non-root; the second keeps the layer comparison visible for discussion.

```bash
$ENGINE image inspect demo:slim --format 'user={{.Config.User}} size={{.Size}}'
$ENGINE history demo:slim
```

Expected: the user is `10001`, and the final image has only the runtime layers.

## Cleanup / reset

Everything lived in the `app/` folder plus a few images — no cluster touched.

```bash
# stop & remove the running container
$ENGINE rm -f demo --force 2>/dev/null || true

# remove the images this lab built (ignore any that aren't there)
$ENGINE rmi -f demo:1 demo:2 demo:slim demo:latest 2>/dev/null || true

# remove the project files
cd .. && rm -rf app
```

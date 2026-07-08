# Lab 01 — Build & inspect a container image (S01)

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
> ```bash
> export ENGINE=docker      # or: export ENGINE=podman   /   export ENGINE=nerdctl
> ```
> Podman and nerdctl are near drop-in replacements for the `docker` CLI used here.

## Files used

All created inline in Step 1 (nothing to download):

- `app/main.go` — a tiny HTTP server that prints its hostname.
- `app/go.mod` — the Go module file (stdlib only, no dependencies).
- `app/Dockerfile` — single-stage build (matches the slide walkthrough).
- `app/Dockerfile.multistage` — the thin, multi-stage version for Step 6.

---

## Step 1 — create the project

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

<details><summary>Solution / expected output</summary>

```console
$ ls
Dockerfile  Dockerfile.multistage  go.mod  main.go
```

You are now inside the `app/` directory. Every later command runs from here.
</details>

---

## Step 2 — build and run

Build the image, tag it `demo:1`, then run it **detached** with the container port published to
your machine.

```bash
$ENGINE build -t demo:1 .
$ENGINE run -d --name demo -p 8080:8080 demo:1
$ENGINE ps
curl -s localhost:8080
```

**Task:** the build succeeds, `ps` shows the container `Up`, and `curl` prints a greeting.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE build -t demo:1 .
 => [1/5] FROM docker.io/library/golang:1.24 ...
 => [2/5] WORKDIR /src
 => [3/5] COPY . .
 => [4/5] RUN go build -o /bin/app .
 => [5/5] RUN useradd -u 10001 app
 => exporting to image
 => => naming to docker.io/library/demo:1

$ $ENGINE run -d --name demo -p 8080:8080 demo:1
3f9a1c...   # the container ID

$ $ENGINE ps
CONTAINER ID   IMAGE    COMMAND      STATUS         PORTS                    NAMES
3f9a1c...      demo:1   "/bin/app"   Up 3 seconds   0.0.0.0:8080->8080/tcp   demo

$ curl -s localhost:8080
hello from 3f9a1c1b2d34
```

The greeting's hostname **is the container ID** — the process sees its own isolated hostname, one
of the namespaces from the slides.
</details>

**Question:** you published `-p 8080:8080`. Which number is the host's and which is the container's?

<details><summary>Answer</summary>

`-p HOST:CONTAINER`. The **left** is your machine's port, the **right** is the port the process
listens on inside the container. They're equal here only because we chose to match them — try
`-p 9090:8080` and you'd curl `localhost:9090`.
</details>

---

## Step 3 — look inside the running container

You don't have to trust the Dockerfile — verify the process is really **non-root**, and inspect it
from both inside and outside.

```bash
$ENGINE exec demo id                                     # who is the process?
$ENGINE top demo                                         # the process, seen from the host
$ENGINE image inspect demo:1 --format '{{.Config.User}}' # what the image declares
```

**Task:** all three agree the app runs as UID **10001**, not root.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE exec demo id
uid=10001(app) gid=10001(app) groups=10001(app)

$ $ENGINE top demo
UID     PID    PPID   C   STIME   TTY   TIME       CMD
10001   1234   1210   0   12:00   ?     00:00:00   /bin/app

$ $ENGINE image inspect demo:1 --format '{{.Config.User}}'
10001
```

`USER 10001` in the Dockerfile is why. Running as a non-root UID is the single cheapest security
win for an image — S02 goes deeper.
</details>

**Task (optional interactive poke):** get a shell and look around, then exit.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE exec -it demo sh
$ whoami        # app  — the user 'useradd' created in the image
$ echo $PORT    # 8080  — baked in by ENV
$ exit
```

The `PORT` value came from the image's `ENV`, not from your shell — configuration travels **with**
the image.
</details>

---

## Step 4 — read the layers, then invalidate the cache

An image is an ordered stack of layers. List them, then change the source and watch which layers
**rebuild** versus come from **cache**.

```bash
$ENGINE history demo:1
```

**Question:** which layer holds your source code?

<details><summary>Answer</summary>

The layer created by **`COPY . .`**. In `history` it's the one whose size jumps to hold your files;
everything the `RUN go build` step produced sits in the layer **above** it. Because layers are
content-addressed, changing your source changes that layer's digest — and every layer after it.

```console
$ $ENGINE history demo:1
IMAGE     CREATED         CREATED BY                        SIZE
<id>      1 minute ago    ENTRYPOINT ["/bin/app"]           0B
<id>      1 minute ago    USER 10001                        0B
<id>      1 minute ago    RUN useradd -u 10001 app          4.1kB
<id>      1 minute ago    ENV PORT=8080                     0B
<id>      1 minute ago    RUN go build -o /bin/app .        12MB
<id>      1 minute ago    COPY . .                          380B     <-- your source
...       (base golang:1.24 layers below)
```
</details>

Now change the source and rebuild:

```bash
sed -i.bak 's/hello from/HELLO from/' main.go && rm -f main.go.bak
$ENGINE build -t demo:2 .
```

**Task:** in the second build, the early layers say **CACHED** but everything from `COPY . .`
downward is rebuilt.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE build -t demo:2 .
 => CACHED [1/5] FROM docker.io/library/golang:1.24 ...
 => CACHED [2/5] WORKDIR /src
 => [3/5] COPY . .                      <-- source changed, cache busted here
 => [4/5] RUN go build -o /bin/app .    <-- and everything after must rerun
 => [5/5] RUN useradd -u 10001 app
```

`FROM` and `WORKDIR` didn't change, so they're reused. The moment a layer's inputs change, that
layer **and all layers below it** are rebuilt. This is why cheap, rarely-changing steps go **early**
in a Dockerfile and `COPY` of fast-changing source goes **late**.
</details>

---

## Step 5 — break it on purpose: `latest` is not "newest"

You never built a `latest` tag. Ask for one anyway and read the failure.

```bash
$ENGINE run --rm demo:latest
```

**Task:** this fails. Read the error, then fix it **two** ways.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE run --rm demo:latest
Unable to find image 'demo:latest' locally
docker: Error response from daemon: pull access denied for demo,
repository does not exist or may require 'docker login'.
```

`latest` is just a **tag** — and the default one the engine assumes when you omit a tag. You only
ever created `demo:1` and `demo:2`, so `demo:latest` doesn't exist locally; the engine then tries
to **pull** it from a registry and fails. `latest` never means "the newest thing you built".

**Fix A — point the tag at a real image:**

```console
$ $ENGINE tag demo:2 demo:latest
$ $ENGINE run --rm -p 8080:8080 demo:latest
listening on :8080
```

**Fix B — don't rely on a tag at all; pin by the image's content digest (ID):**

```console
$ $ENGINE inspect --format '{{.Id}}' demo:2
sha256:9b2c...e41
$ $ENGINE run --rm sha256:9b2c...e41
listening on :8080
```

A tag can be moved to point anywhere; a **digest** always names the exact bytes you tested. That's
the difference the slide called out — and what "pin by digest" means in production.
</details>

**Question:** you just moved `demo:latest` to `demo:2`. If a teammate had `demo:latest` cached from
yesterday, would they get your new image?

<details><summary>Answer</summary>

Not automatically — their local `latest` still points at whatever digest they pulled yesterday until
they explicitly re-pull. Two machines can hold **different images under the same `latest` tag**. This
ambiguity is exactly why tags are unreliable for anything you need to reproduce.
</details>

---

## Step 6 — multi-stage: ship thin

Rebuild with the multi-stage Dockerfile, which discards the toolchain, then compare sizes.

```bash
$ENGINE build -f Dockerfile.multistage -t demo:slim .
$ENGINE images demo
```

**Task:** `demo:slim` is dramatically smaller than `demo:1`.

<details><summary>Solution / expected output</summary>

```console
$ $ENGINE images demo
REPOSITORY   TAG    IMAGE ID      SIZE
demo         slim   a1b2c3...     ~18MB
demo         2      d4e5f6...     ~830MB
demo         1      d4e5f6...     ~830MB
demo         latest d4e5f6...     ~830MB
```

The single-stage image carries the **entire Go toolchain**; the multi-stage image ships only the
compiled binary on a tiny `alpine` base — roughly **40× smaller**. Smaller images pull faster and
expose far less to attack. S02 goes one step further with **distroless** bases (smaller still, and
no shell at all).
</details>

**Question:** why can the builder stage be huge without bloating the final image?

<details><summary>Answer</summary>

Because only what you `COPY --from=build` is kept — the builder stage (compiler, source, caches, any
build-time secrets) is **thrown away**. The final image starts from a fresh `FROM` and inherits
nothing from the builder except the files you explicitly copy.
</details>

---

## Expected observations

- `$ENGINE build` produces `demo:1`; the container runs and `curl localhost:8080` answers.
- The process runs as **UID 10001**, confirmed inside (`id`), from the host (`top`), and in the
  image config (`.Config.User`).
- `history` shows the image as ordered layers; changing the source rebuilds **`COPY` and below**
  while earlier layers stay **CACHED**.
- `run demo:latest` **fails** until you tag or pin — proving `latest` guarantees nothing.
- The multi-stage `demo:slim` is **~40× smaller** than the single-stage image.

---

## Cleanup / panic reset

Everything lived in the `app/` folder plus a few images — no cluster touched.

```bash
# stop & remove the running container
$ENGINE rm -f demo --force 2>/dev/null || true

# remove the images this lab built (ignore any that aren't there)
$ENGINE rmi -f demo:1 demo:2 demo:slim demo:latest 2>/dev/null || true

# remove the project files
cd .. && rm -rf app
```

<details><summary>Panic reset — reclaim everything this lab created</summary>

If images or a stopped container linger, prune what's dangling (this only removes **unused** data,
not images other work depends on):

```console
$ $ENGINE rm -f demo
$ $ENGINE image prune -f          # remove dangling (untagged) layers
```

Nothing here is namespaced or shared — it's all local to your machine, so a full prune is safe.
</details>

## Stretch (optional)

Prove the source really is baked into one layer: rebuild changing **only** `ENV PORT`, and confirm
the expensive `go build` layer is reused.

<details><summary>Solution / expected output</summary>

Edit just the `ENV` line so it sits **after** the build, rebuild, and watch:

```console
$ sed -i.bak 's/ENV PORT=8080/ENV PORT=9090/' Dockerfile && rm -f Dockerfile.bak
$ $ENGINE build -t demo:3 .
 => CACHED [3/5] COPY . .
 => CACHED [4/5] RUN go build -o /bin/app .    <-- expensive step reused!
 => [5/5] ...ENV/USER re-applied
```

Because `COPY` and `RUN go build` didn't change, their cached layers are reused — only the cheap
metadata below rebuilds. **Layer ordering is a performance tool:** put the slow, stable steps high
and the fast, churning ones low. (Reset with `git checkout` or re-run Step 1's heredoc.)
</details>

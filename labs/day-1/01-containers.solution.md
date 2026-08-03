# Lab 01 — Build & inspect a container image (S01) — solutions

Use this companion after attempting the participant lab. Outputs contain representative
names, addresses, ages, and image sizes; compare the state and meaning rather than copying
ephemeral values literally.

## Guided solutions

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

<details><summary>Solution / expected output</summary>

```console
$ ls
Dockerfile  Dockerfile.multistage  go.mod  main.go
```

You are now inside the `app/` directory. Every later command runs from here.
</details>

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

### Step 3 — look inside the running container

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

### Step 4 — read the layers, then invalidate the cache

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

### Step 5 — break it on purpose: `latest` is not "newest"

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

### Step 6 — multi-stage: ship thin

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

## Expected state / output

- `$ENGINE build` produces `demo:1`; the container runs and `curl localhost:8080` answers.
- The process runs as **UID 10001**, confirmed inside (`id`), from the host (`top`), and in the
  image config (`.Config.User`).
- `history` shows the image as ordered layers; changing the source rebuilds **`COPY` and below**
  while earlier layers stay **CACHED**.
- `run demo:latest` **fails** until you tag or pin — proving `latest` guarantees nothing.
- The multi-stage `demo:slim` is **~40× smaller** than the single-stage image.

---

## Explanation

The lab separates image identity, runtime identity, and build-cache behaviour. Tags are
movable names, while an image digest identifies exact bytes. A multi-stage build discards
the compiler and source, and Docker reuses only the layers whose inputs and preceding
layers remain unchanged.

## Troubleshooting and recovery

If a port is busy, remove only this lab's named container with
`$ENGINE rm -f demo`, then repeat the run command. If a build fails after editing, restore
`main.go` and the Dockerfiles by rerunning Step 1's heredocs.

## Challenge solution

### Commands / manifest

```console
$ sed -i.bak 's/ENV PORT=8080/ENV PORT=9090/' Dockerfile && rm -f Dockerfile.bak
$ $ENGINE build -t demo:3 .
 => CACHED [3/5] COPY . .
 => CACHED [4/5] RUN go build -o /bin/app .    <-- expensive step reused!
 => [5/5] ...ENV/USER re-applied
```

### Expected state / output

The second build reports the source `COPY` and expensive `RUN go build` steps as `CACHED`. Only
the cheap metadata layer below them changes. Restore the original Dockerfile with the Step 1
heredoc after recording the result.

### Explanation

Docker invalidates a layer and every layer below it. Moving frequently changed metadata below the
slow build step preserves the build cache without changing the resulting application binary.

### Hints

Move `ENV PORT` below `RUN go build`, then compare the second build's `COPY` and `RUN` lines with
the first build.

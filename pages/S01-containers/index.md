---
layout: section-cover
day: Day 1
section: '01'
tier: recommended
track: Foundations
---

# Containers

Explain what a container image is — and build one.

**recommended** · suggested Day 1 · Foundations track

<!--
Section S01 — Containers. Timing: ~30 min slides + 25 min lab.
Outcome: learners can explain what a container image IS and build one, so Pods
make sense from the ground up.
Beats: why containers vs VMs · image = content-addressed layers · reference
string anatomy · engine vs runtime / CRI / namespaces+cgroups · Dockerfile
built field by field · multi-stage · latest is not a version · layers observed.
CKx tie-in: CKAD Application Design & Build (image fundamentals).
Lab: labs/day-1/01-containers.md.
-->

---
layout: comparison
heading: 'Why containers — same machine, stronger walls'
leftHeading: Virtual machine
rightHeading: Container
leftBadge: hardware virtualization
rightBadge: OS virtualization
---

- Emulates **hardware**; ships a **whole guest OS + kernel**.
- Boots in **seconds to minutes**; gigabytes on disk.
- Strong isolation — a full kernel per workload.
- A handful per host.

::right::

- Shares the **host kernel**; ships only your **app + its deps**.
- Starts in **milliseconds**; tens of megabytes.
- Isolation from kernel features, not a second kernel.
- **Hundreds** per host — the density Kubernetes schedules on.

<div class="mt-4 text-sm" v-click>

Same isolation goals, far less overhead. That density and fast start is exactly
what a scheduler wants — which is why a **container** is the thing Kubernetes runs.

</div>

<!--
Speaker: the trade is a shared kernel — lighter, but the isolation boundary is
kernel features (namespaces + cgroups), not hardware. That boundary is what
Day 3's pod-escape module attacks and hardens.
-->

---
layout: code-annotated
heading: 'An image is layers — addressed by content'
---

```text {none|1|1|2|3|4}
registry.example.com/team/app:1.4.2@sha256:9b2c...e41
└──────────────┬──────────────┘ └─┬─┘ └──────┬──────┘
        registry / repository     tag      digest
```

::notes::

<CodeNote at="1" label="registry / repository">
<strong>Where</strong> and <strong>what</strong>. The registry is the host that
stores images; the repository is the named path inside it. Omit the registry and
the engine assumes a default public one.
</CodeNote>

<CodeNote at="2" label="tag">
A <strong>human label</strong> that points at a digest — and can be moved. Handy,
but mutable: <code>1.4.2</code> today may point somewhere else tomorrow.
</CodeNote>

<CodeNote at="3" label="digest" variant="ok">
A <strong>content hash</strong> of the exact image. Same digest = byte-identical
image, forever. This is what "pin by digest" means — immutable by construction.
</CodeNote>

<CodeNote at="4" label="layers">
The image itself is an <strong>ordered stack of layers</strong>, each a filesystem
diff with its own digest. Shared base layers are pulled and cached <strong>once</strong>.
</CodeNote>

<!--
Speaker: content-addressing is the whole trick — layers and images are named by
the hash of their bytes, so caching and integrity come for free. Tag vs digest
returns in the lab's deliberate break.
-->

---

<span class="kw-kicker">What actually runs a container</span>

# Engine, runtime, and the kernel primitives

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Engine / CRI" icon="🛠️">
      What the kubelet talks to: <strong>containerd</strong> or <strong>CRI-O</strong>,
      speaking the <strong>Container Runtime Interface</strong>. Pulls images,
      manages container lifecycle.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="OCI runtime" icon="⚙️">
      The low-level tool that actually spawns the process:
      <strong>runc</strong> or <strong>crun</strong>. Given a bundle + config, it
      asks the kernel for an isolated process.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Kernel primitives" icon="🧬" variant="plain">
      The isolation itself: <strong>namespaces</strong> (separate view of PIDs,
      network, mounts, users) + <strong>cgroups</strong> (limit CPU, memory, I/O).
      No magic — just Linux.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

`kubelet → CRI (containerd/CRI-O) → OCI runtime (runc/crun) → namespaces + cgroups`.
The **container runtime** column reappears in the S03 node diagram — this is that box, opened up.

</div>

<!--
Speaker: a container is not a kind of object the kernel knows about — it's an
ordinary process the kernel has been told to isolate. Namespaces = what it sees;
cgroups = what it may use.
-->

---
layout: code-walkthrough
heading: 'Build an image — one instruction, one layer'
lab: labs/day-1/01-containers.md
---

````md magic-move
```dockerfile
# start from a base image (itself a stack of layers)
FROM golang:1.24
```

```dockerfile
FROM golang:1.24
# a stable working directory for everything that follows
WORKDIR /src
```

```dockerfile
FROM golang:1.24
WORKDIR /src
# copy source in — this layer's digest changes when the code changes
COPY . .
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
# run a build step; its result becomes a new layer
RUN go build -o /bin/app .
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
# bake in configuration as environment
ENV PORT=8080
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
# drop root — the process runs as an unprivileged user
RUN useradd -u 10001 app
USER 10001
```

```dockerfile
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
ENV PORT=8080
RUN useradd -u 10001 app
USER 10001
# document the port, then define the process to start
EXPOSE 8080
ENTRYPOINT ["/bin/app"]
```
````

<!--
Speaker: each instruction that changes the filesystem adds a layer; ENV/EXPOSE
are metadata. Order matters for caching — cheap, rarely-changing steps first,
COPY of source late. USER before ENTRYPOINT is the non-root habit S02 builds on.
-->

---
layout: two-cols-code
heading: 'Multi-stage — build fat, ship thin'
lab: labs/day-1/01-containers.md
---

````md magic-move
```dockerfile
# one stage: the toolchain ships with the app — ~800 MB
FROM golang:1.24
WORKDIR /src
COPY . .
RUN go build -o /bin/app .
USER 10001
ENTRYPOINT ["/bin/app"]
```

```dockerfile
# stage 1: build with the full toolchain
FROM golang:1.24 AS build
WORKDIR /src
COPY . .
RUN go build -o /bin/app .

# stage 2: ship only the binary — ~15 MB
FROM alpine:3.20
RUN adduser -D -u 10001 app
COPY --from=build /bin/app /bin/app
USER 10001
ENTRYPOINT ["/bin/app"]
```
````

::right::

<div class="text-sm">

The **builder stage is discarded** — only what you `COPY --from=build` ships.
The toolchain, source, and any build-time secrets stay behind.

<div class="mt-3">
  <KwChip variant="ok">smaller = faster pulls</KwChip>
  <KwChip variant="ok">smaller = less to attack</KwChip>
</div>

<div class="mt-4 kw-muted">

S02 takes this further — distroless bases, scanning, and provenance.

</div>

</div>

<!--
Speaker: the size drop is the visible win; the security win (no compiler, no
source, no leaked secrets in the shipped layers) is the one that matters. The
lab has them measure both images with `docker images`.
-->

---
layout: code-annotated
heading: '`latest` is a pointer, not a version'
lab: labs/day-1/01-containers.md
---

```bash {none|1|2|3}
docker build -t demo:1 .
docker run demo:latest        # only demo:1 exists...
docker run demo:1@sha256:9b2c...e41
```

::notes::

<CodeNote at="1" label="a real tag">
You built and named <code>demo:1</code>. That tag now points at the digest of
what you just built.
</CodeNote>

<CodeNote at="2" label="latest ≠ newest" variant="warn">
<code>latest</code> is just a tag that happens to be the default — you never set
it, so it isn't there. The engine looks locally, then tries to <strong>pull</strong>
it, then fails. "Latest" guarantees nothing.
</CodeNote>

<CodeNote at="3" label="pin by digest" variant="ok">
Reference the <strong>digest</strong> and you always get the exact bytes you
tested — the reproducibility tags can't promise. The lab breaks this on purpose.
</CodeNote>

<!--
Speaker: this is the single most common beginner surprise — "latest" reads like
"newest" but is only a default tag. Foreshadows S02's digest-pinning beat and
the lab's break→fix.
-->

---
layout: lab
lab: labs/day-1/01-containers.md
duration: 25 min
env: local — no cluster needed
---

## Lab 01 — Build & inspect an image

- **Build** the provided Dockerfile, run it detached, and map a port
- **Exec in** — inspect the processes and the non-root user, then the image config
- **Layers:** read them with `history`; change a `COPY` and watch the cache invalidate
- **Break it on purpose:** `run demo:latest` when only `demo:1` exists → fix it
- **Multi-stage:** rebuild thin and compare `docker images` sizes before/after

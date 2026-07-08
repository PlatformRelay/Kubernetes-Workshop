---
layout: section-cover
day: Day 1
section: '00'
tier: core
track: Foundations
---

# Welcome & setup

Everyone can reach their environment and run kubectl.

**core** · suggested Day 1 · Foundations track

<!--
Section S00 — Welcome & setup. Timing: ~20 min slides + 15 min lab.
Outcome: everyone can reach their environment and run kubectl.
Beats: goals + 50/50 contract · agenda / red line · two environments ·
ground rules · how labs work · prerequisites · optional container refresher ·
context switching. CKx tie-in: —. Lab: labs/day-1/00-setup.md.
-->

---
layout: statement
kicker: Why we're here
---

Three days to take you from **"what is a container"** to confidently
**authoring, running, and operating** core Kubernetes workloads.

Half the time is slides, half is your keyboard: every concept block ends with
a lab you run in **your own** environment.

<!--
Speaker: state the outcome out loud. The 50/50 contract is the promise of the
whole workshop — every idea is immediately practised. Point at the footer
progress bar: they'll see the red line grow all day.
-->

---
layout: agenda
heading: Day 1 — foundations and the red line
kicker: What today builds
columns: 2
---

- **Containers** — images, layers, runtimes <em>· then Lab 01</em>
- **Container security** — small, non-root, scanned images <em>· then Lab 02</em>
- **Mental model** — control plane, nodes, reconciliation <em>· then Lab 03</em>
- **kubectl** — get, describe, explain, apply <em>· then Lab 04</em>
- **Pod** 📦 — the smallest deployable unit <em>· then Lab 05</em>
- **Deployment** — desired state & rolling updates <em>· then Lab 06</em>
- **Service** — a stable address for moving Pods <em>· then Lab 07</em>
- **Ingress** — HTTP from outside the cluster <em>· then Lab 08</em>

<div class="mt-4 kw-muted text-sm" v-click>

The core spine is one **red line** — `Pod → Deployment → Service → Ingress → Gateway API` —
and every step **extends the same manifest** so you always see the through-line.

</div>

<!--
Speaker: the numbered cards are concept blocks; the "then Lab NN" tag is the
50/50 contract made visible. Gateway API (red line 5/5) lands Day 2.
-->

---
layout: comparison
heading: 'Two ways to work — pick one, both keep up'
leftHeading: Assigned namespace
rightHeading: Local kind cluster
leftBadge: shared cluster
rightBadge: your laptop
---

- A slice of a **shared cluster** the facilitator runs.
- You own **one namespace** (e.g. `student-07`); no cluster-admin.
- Nothing to install beyond `kubectl` + a kubeconfig.
- A few labs that need cluster-wide add-ons run **read-only** here.

::right::

- A throwaway single-node cluster on **your machine**.
- You are **admin** — every lab, including add-on installs, works.
- Needs `kind` + a container engine (Docker or Podman).
- Panic reset is `kind delete cluster` → recreate in ~30 s.

<div class="mt-4 text-sm" v-click>

**Which am I on?** Run `kubectl config current-context`: a name like
`kind-workshop` means your laptop; anything else is the shared cluster. Every
lab states which environment it supports.

</div>

<!--
Speaker: labs are environment-honest — each one is badged namespace ✓ / kind ✓,
kind-only, or namespace: read-only. Nobody is left behind either way.
-->

---

<span class="kw-kicker">Ground rules</span>

# How this room works

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Questions welcome" icon="🙋">
      Interrupt anytime. If one person is confused, five others are too —
      asking is doing everyone a favour.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Least privilege" icon="🔒">
      No lab needs <strong>cluster-admin</strong> unless it's flagged
      <code>kind-only</code>. On the shared cluster you stay inside your
      namespace — that's RBAC doing its job.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="You can't break it" icon="🧯" variant="plain">
      Every lab ends with a <strong>panic reset</strong> scoped to your
      namespace. A wedged lab never blocks the next one.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

The teaching rhythm repeats all day: **explain → run → observe → break it on
purpose → fix it → debrief.** The breakage is the point — that's where the
learning is.

</div>

<!--
Speaker: emphasise "break it on purpose". Every lab has a deliberate
break→fix step so failures become familiar, not scary.
-->

---

<span class="kw-kicker">How labs work</span>

# Every task carries a spoiler

Labs are standalone Markdown — explicit, copy-pasteable steps. **No "figure it
out".** Every task and every question is followed by a collapsed answer, so you
can never get permanently stuck.

<div class="mt-4" v-click>

> **Task:** set your default namespace, then confirm it took.

</div>

<div class="mt-3" v-click>

> **Question:** which command proves the change without dumping the whole kubeconfig?

</div>

<div class="mt-3" v-click>

Stuck? Open the spoiler:

```console
$ kubectl config view --minify | grep namespace:
    namespace: student-07
```

`--minify` collapses the config to the current context — one line, the answer.

</div>

<div v-click class="mt-4 kw-muted text-sm">

In the real lab that answer lives inside a collapsed <code>&lt;details&gt;</code>
block. Try first; peek if you need to; keep moving.

</div>

<!--
Speaker: demo the spoiler pattern live — read the task, ask the room the
question, then "open the spoiler". This is exactly Lab 00's shape.
-->

---

<span class="kw-kicker">Before Lab 00</span>

# What you need on your machine

<div class="kw-cols-2 mt-4">
  <KwCard heading="Required" icon="✅">
    <ul class="text-sm">
      <li><code>kubectl</code> on your <code>PATH</code></li>
      <li>A kubeconfig — assigned namespace <em>or</em> kind</li>
      <li>A terminal you can copy-paste into</li>
    </ul>
  </KwCard>
  <KwCard heading="For the kind path" icon="🐳" variant="plain">
    <ul class="text-sm">
      <li><code>kind</code> installed</li>
      <li>A container engine: Docker or Podman</li>
      <li>Admin over your own machine</li>
    </ul>
  </KwCard>
</div>

<div v-click class="mt-5 text-sm">

**Pre-flight check (Lab 00):** confirm `kubectl version` reaches a server, set
your namespace, and prove `kubectl auth can-i create pods` returns `yes`. That
lands everyone at the **same known-good baseline** before any real content.

</div>

<LabCallout lab="labs/day-1/00-setup.md" />

<!--
Speaker: don't debug installs live — send anyone missing a tool to the setup
appendix while the room starts Lab 00. Client/server version skew of one minor
is fine; flag it if odd errors appear later.
-->

---
showRefresher: true
---

<span class="kw-kicker">Optional · new to containers?</span>

# 60-second container refresher

<div v-if="$frontmatter.showRefresher">

<div class="kw-cols-2 mt-2">
  <KwCard heading="A container" icon="📦">
    One process (or a few) running in an <strong>isolated view</strong> of the
    OS — its own filesystem, network, and process tree — while sharing the
    host <strong>kernel</strong>. Lighter than a VM, starts in milliseconds.
  </KwCard>
  <KwCard heading="An image" icon="🧱" variant="plain">
    The <strong>read-only template</strong> a container is started from: your
    app plus its dependencies, frozen as stacked <strong>layers</strong>.
    Kubernetes schedules containers; images are what it pulls to run them.
  </KwCard>
</div>

<div class="mt-4 kw-muted text-sm">

That's enough to start. **Sections S01–S02 go deep** on images, layers,
runtimes, and hardening — flip <code>showRefresher: false</code> in this slide's
frontmatter to hide this beat for a stronger cohort.

</div>

</div>

<!--
Speaker: build/v-if toggle — for an experienced room set showRefresher: false
and this slide collapses to just the heading. No shared animation here.
-->

---
layout: code-annotated
heading: 'Point kubectl at the right place'
lab: labs/day-1/00-setup.md
---

```bash {none|1|2|3|4}
kubectl config get-contexts
kubectl config use-context kind-workshop
kubectl config set-context --current --namespace=student-07
kubectl config view --minify | grep namespace:
```

::notes::

<CodeNote at="1" label="get-contexts">
Lists every cluster your kubeconfig knows. The <code>*</code> marks the one
you're pointed at right now.
</CodeNote>

<CodeNote at="2" label="use-context">
Switches clusters. Kind users are already on <code>kind-workshop</code>; shared
users pick the context the facilitator gave them.
</CodeNote>

<CodeNote at="3" label="set-context --namespace">
Makes your namespace the default so you can drop <code>-n</code> from every
later command. This one line saves you a thousand keystrokes today.
</CodeNote>

<CodeNote at="4" label="verify" variant="ok">
<code>--minify</code> shows only the active context — the fastest proof your
namespace stuck. This is the spoiler answer from earlier.
</CodeNote>

<!--
Speaker: this is the whole of "context management" they need for the workshop.
Everything else — RBAC, multiple clusters — comes later (Lab 19).
-->

---
layout: lab
lab: labs/day-1/00-setup.md
duration: 15 min
env: namespace ✓ / kind ✓
---

## Lab 00 — Setup & pre-flight check

- Confirm `kubectl version` reaches a **server**, not just a client
- Set your assigned **namespace** (or spin up a kind cluster) as the default
- Prove you can create workloads: `kubectl auth can-i create pods` → `yes`
- **Break it on purpose:** point at a bad context, read the error, switch back
- Land at the shared **clean baseline** — and learn the panic reset for later

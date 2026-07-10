---
layout: section-cover
image: /covers/section-25-breakout-foiled.png
day: Day 3
section: '25'
tier: recommended
track: Security
---

# Security & pod escape

How weak Pod settings enable a container escape — and how to prevent it.

**recommended** · suggested Day 3 · Security track

<!--
Section S25 — Security & pod escape (offensive-then-DEFENSIVE counterpart to S17).
Suggested Day 3 (M5, Security track). Timing: ~35 min slides + 30 min lab. This is
DEFENSIVE security education: a controlled, kind-only demonstration of a container escape
via dangerous Pod settings, immediately followed by the defence (restricted Pod Security
Admission blocks the same Pod at CREATE). The framing is a hard requirement — the FIRST
content slide after this cover is the ethics/scope statement; every attack beat is conceptual
(diagram/cards) on the slides; the only "live" thing is a benign node-filesystem READ in the lab.
Beats: (1) DEFENSIVE framing + ethics/scope · (2) shared-kernel threat model (containers are
processes, not VMs) · (3) catalogue of dangerous settings · (4) conceptual escape walkthrough
(privileged + hostPath / → node filesystem) · (5) magic-move attacker Pod → hardened Pod ·
(6) AdmissionGate — the SAME restricted gate admitting the hardened Pod · (7) defences map
(S02/S17/S18 + scan/detect) · (8) NSA/CISA + MITRE ATT&CK + tool categories · (9) recap → lab.
Reuse AdmissionGate.vue (do NOT author a new component). NOTE: AdmissionGate renders the FOUR
restricted fields (runAsNonRoot / allowPrivilegeEscalation / drop ALL / seccompProfile) — NOT
privileged/hostPath. So it is narrated ONLY as "the same gate that admits the hardened Pod";
the privileged/hostPath-specific REJECTION lives in the static cards and the lab's real output.
CKx tie-in: CKA security & hardening (defensive).
-->

---
layout: statement
kicker: Read this first · scope & ethics
---

This is **defensive** security. Everything here runs in a **throwaway kind cluster you own** —
**never** against a shared or production cluster.

We demonstrate one container escape **so you can recognise and block it**. The lab reads a single
**benign** file to *prove* access, then spends the rest of its time on the defence. No credentials
are dumped, nothing is exfiltrated, nothing is destroyed. Run the offensive step **only** on a
cluster you created and will delete.

<!--
Speaker: say this out loud before any attack content — it's a hard rule, not a disclaimer. Frame:
we are learning to DEFEND, and you cannot defend a technique you have never seen. So we show ONE
escape, in the most contained way possible: a kind cluster you spun up and will throw away. The
lab has a context-check.sh that refuses to run unless the current context is a `kind-` context —
that guard gates every offensive step. The "attack" itself is a single READ of /host/etc/os-release
to prove we're touching the node's filesystem; we do NOT read Secrets, kubelet certs, or the
runtime socket — the point is made by demonstrating ACCESS, and the danger is explained in words.
Then we delete the Pod and spend the rest of the section blocking it. If anyone is on a shared
cluster: watch, don't type. This is the ethics/scope contract for the whole section.
-->

---
layout: statement
kicker: Mental model · the threat starts here
---

A container is **not a VM**. It's a **process on the host's kernel**, fenced off by namespaces and
cgroups.

That fence is a **configuration**, not a wall. Weaken the isolation — run as root, add
capabilities, mount the host, share its namespaces — and "root in the container" moves a short step
toward **root on the node**. Every dangerous setting on the next slide widens that gap.

<!--
Speaker: this is the whole reason the escape is possible, and it's a callback to S01/S03 (namespaces
+ cgroups) and S17 (shared kernel, runs as root by default). A VM has its own kernel; a hypervisor
boundary. A container shares the NODE's single kernel — isolation is Linux namespaces (pid, net,
mnt, …) + cgroups, switched on by the container runtime. Those are knobs. Turn the wrong ones and
the process can see the host's processes (hostPID), the host's network (hostNetwork), the host's
filesystem (hostPath), or gain kernel-level powers (privileged, SYS_ADMIN). None of these is a
"hack" — they're all supported Pod fields, meant for a tiny set of trusted system workloads, that
become an escape hatch on an ordinary app Pod. Next: the specific fields that do it.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">The dangerous settings · each trades isolation for host access</span>

# What weakens the fence

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="privileged: true" icon="🔓" variant="danger">
      Near-total power: (almost) all capabilities, device access, weakened seccomp/AppArmor. The
      single biggest lever — most escapes start here.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="hostPath volume (especially /)" kind="pod" variant="danger">
      Mounts a host directory into the Pod. Mount <code>/</code> and you can read and write the
      <strong>node's entire filesystem</strong> from inside the container.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="hostPID / hostNetwork" kind="node" variant="danger">
      Share the node's process table or network stack — see and signal host processes, sniff host
      traffic, reach node-local services (kubelet, metadata).
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="mount the runtime socket" icon="🐳" variant="danger">
      A <code>hostPath</code> of <code>/run/containerd/containerd.sock</code> (or the Docker socket)
      lets the Pod start <em>new</em> privileged containers on the node — game over.
    </KwCard>
  </v-click>
  <v-click at="5">
    <KwCard heading="SYS_ADMIN / SYS_PTRACE caps" icon="⚙️" variant="danger">
      Powerful capabilities without full <code>privileged</code>: mount filesystems, manipulate
      namespaces (<code>SYS_ADMIN</code>), inspect/inject into other processes (<code>SYS_PTRACE</code>).
    </KwCard>
  </v-click>
  <v-click at="6">
    <KwCard heading="The common thread" icon="🎯" variant="warn">
      Each one hands the container a piece of the <strong>host</strong>. <code>restricted</code>
      forbids <em>all</em> of them — that's the defence, later this section.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: this is the catalogue — name each one and what host resource it leaks. privileged is the
headline: it's not "one capability", it's the whole set plus device nodes plus a relaxed seccomp
profile — the runtime basically stops fencing you. hostPath is the filesystem door; hostPath of /
is the extreme case the lab uses. hostPID/hostNetwork share the node's PID and net namespaces —
suddenly `ps` shows host processes and you can reach 169.254.169.254 or the kubelet's port. Mounting
the container runtime socket is the quiet catastrophe: with containerd.sock you ask the node's own
runtime to launch a privileged container for you — you don't even need an escape, you ARE the
control plane for that node. SYS_ADMIN/SYS_PTRACE are the "privileged-lite" caps people add without
thinking. The point to land: none of these is exotic; they're all Pod spec fields. And every single
one is blocked by the `restricted` Pod Security Standard from S17 — hold that thought for the fix.
-->

---
layout: statement
kicker: Conceptual walkthrough · no live exploit here
---

# privileged + `hostPath: /` → own the node

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="1 · Attacker gets a foothold" icon="🚪" variant="warn">
      A compromised dependency or an over-permissive manifest lands a Pod that sets
      <code>privileged: true</code> and mounts <code>hostPath: /</code> at <code>/host</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="2 · The host filesystem is right there" kind="node" variant="danger">
      <code>/host</code> inside the Pod <em>is</em> the node's <code>/</code>. Read
      <code>/host/etc/kubernetes</code>, kubelet certs, every Pod's Secrets under
      <code>/host/var/lib/kubelet</code>…
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="3 · Read becomes write becomes node" icon="✍️" variant="danger">
      Writable host root means drop a static Pod into
      <code>/host/etc/kubernetes/manifests</code>, or a cron job, or SSH keys — arbitrary code as
      <strong>root on the node</strong>.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="4 · One node → the cluster" icon="🌐" variant="danger">
      Node-root reads the kubelet's credentials and every Secret scheduled there. From a worker,
      pivot toward tokens that reach the API server. Blast radius = the cluster.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
The lab proves step 2 with a single <strong>benign read</strong> — <code>cat
/host/etc/os-release</code> — then stops. We demonstrate <em>access</em>; we don't exfiltrate.
</div>

<!--
Speaker: conceptual ONLY — there is no live exploit on this slide, just the chain of reasoning, so
learners understand why the settings matter. Walk the four cards: (1) the foothold is mundane — a
poisoned npm/pip dependency, or a teammate who copied a "make it work" privileged manifest off the
internet. (2) hostPath / mounted at /host means the container's /host directory is literally the
node root inode — no exploit needed, it's a supported mount; you can now read the kubelet's client
cert, the CA, and under /var/lib/kubelet every projected ServiceAccount token and Secret of every
Pod on that node. (3) because it's read-WRITE, you escalate: /etc/kubernetes/manifests is the static-
pod directory the kubelet watches — drop a manifest there and the kubelet runs it as root, no API
server involved. (4) node compromise cascades: that node's Secrets, its kubelet identity, lateral
movement. The lab deliberately stops at a READ of /etc/os-release — that single file proves we're
on the node's filesystem (it's the NODE's OS, not the container image's), and the danger of
everything else is explained in the "why dangerous" spoiler, not performed. Say it plainly: we make
the point by showing access, not by stealing anything.
-->

---
layout: code-walkthrough
heading: 'The attacker Pod → the manifest a restricted namespace admits'
lab: labs/day-3/25-pod-escape.md
---

````md magic-move
```yaml
# 0: the ESCAPE Pod — privileged + the whole host filesystem at /host.
#    A restricted namespace REJECTS this at admission (before it exists).
apiVersion: v1
kind: Pod
metadata: { name: escape, labels: { app: s25 } }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        privileged: true                  # ← near-total power on the node
      volumeMounts:
        - { name: host, mountPath: /host }  # ← node's / is now /host
  volumes:
    - name: host
      hostPath: { path: / }               # ← mount the entire host root
```

```yaml
# 1: drop privileged + the hostPath mount — the two escape levers are gone.
apiVersion: v1
kind: Pod
metadata: { name: escape, labels: { app: s25 } }
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      # no privileged, no hostPath volume
```

```yaml
# 2: +the four restricted gates (S17), pinned to a real non-root UID.
spec:
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000                   # explicit non-root UID (alpine runs at any UID)
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
```

```yaml
# 3: the HARDENED Pod in full — this is what `enforce: restricted` ADMITS.
apiVersion: v1
kind: Pod
metadata: { name: hardened, labels: { app: s25 } }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: shell
      image: alpine:3.20
      command: ["sleep", "3600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
```
````

<!--
Speaker: four frames, and the boundary in the middle is the whole story. Frame 0 is the attacker's
Pod — privileged:true plus a hostPath of / mounted at /host; those two lines ARE the escape. In a
permissive namespace it runs; in a `restricted` namespace it is REJECTED at admission and never
exists. Frame 1 removes exactly the two escape levers (privileged, the hostPath volume) — necessary
but not yet sufficient: a bare Pod still fails `restricted` on the four fields from S17. Frame 2
adds those four gates (runAsNonRoot, allowPrivilegeEscalation:false, drop ALL, seccompProfile) and
pins runAsUser:1000 — alpine happily runs as any UID, so unlike S17's nginx-101 there's no image
landmine. Frame 3 is the final hardened manifest the restricted gate admits — note runAsNonRoot /
runAsUser / seccomp lifted to Pod level to cover the whole Pod. Same namespace, same policy; the
manifest is what changed. This magic-move IS the lab's escape → block → harden arc.
-->

---

<span class="kw-kicker">The same restricted gate from S17 — now admitting the hardened Pod</span>

# The admission gate holds the line

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- A `restricted` violator is checked **before it's stored** — the four gates fail → **Forbidden**,
  nothing created. (The lab's escape Pod *also* trips `privileged` + `hostPath` — real violations
  this gate doesn't draw.)
- Strip the escape levers, set the four fields, and re-apply the **same** workload…
- …every gate passes → **admitted** and scheduled.
- Same policy, same namespace — the **manifest** met the bar, not the other way round.

</v-clicks>
</div>

<!--
Speaker: reuse note — this is the S17 AdmissionGate, and it visualises the FOUR restricted fields
(runAsNonRoot / allowPrivilegeEscalation / drop ALL / seccompProfile). It does NOT draw the
privileged/hostPath check, so DON'T claim the animation shows "privileged blocked" — say that in
words. Narrate: (bullet 1, spoken over step 0) the escape Pod would be rejected for privileged +
hostPath — that rejection is real (you'll see it in the lab) but it's the STRING, not this diagram.
This diagram then does the general lesson: (step 1) even the escape-levers-removed bare Pod is
DENIED on the four fields; (step 2) re-apply hardened; (step 3) ADMITTED. The takeaway is identical
to S17 and it's the point of the whole section: `restricted` forbids the escape settings AND
demands least privilege — one namespace label closes the door the escape Pod walked through.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Defence in depth · you already have most of these</span>

# The defences map

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="S02 · image hygiene" icon="📦" variant="ok">
      Non-root <code>USER</code>, minimal base, no shell/tools to pivot with, scanned for known CVEs.
      A smaller image is a smaller foothold.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="S17 · restricted PSS + admission" kind="ns" variant="ok">
      <code>enforce: restricted</code> forbids <code>privileged</code>, <code>hostPath</code>, host
      namespaces, and demands drop-ALL + non-root + seccomp. <strong>This is the primary block.</strong>
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="S18 · NetworkPolicy" kind="netpol" variant="ok">
      Default-deny east-west traffic so a foothold can't freely scan and pivot to other Pods or the
      metadata endpoint.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Scan + detect" icon="🔎" variant="ok">
      Scan images for CVEs <em>before</em> deploy; run a runtime detector to alert on the escape
      behaviours (unexpected mounts, host access, new privileged containers) <em>after</em>.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 text-sm kw-muted">
No single control is enough — <strong>admission</strong> stops the manifest, the
<strong>image</strong> shrinks the foothold, the <strong>network</strong> contains the blast, and
<strong>detection</strong> catches what slips through.
</div>

</div>

<!--
Speaker: tie every earlier Day-3 security beat to this escape as a named defence — that's the payoff
of the whole track. S02 (image hygiene): a non-root, distroless-style image with no shell gives the
attacker far less to work with even if a Pod is over-permissioned; scanning catches the poisoned
dependency before it ships. S17 (restricted PSS at admission) is the PRIMARY control here — it
literally forbids every field the escape Pod needs, and it does so BEFORE the Pod exists; if you
take one thing away, it's "label your namespaces restricted." S18 (NetworkPolicy): default-deny so a
compromised Pod can't sweep the namespace or hit 169.254.169.254 unimpeded — it contains blast
radius. Then two categories beyond this workshop: image scanning (shift-left, pre-deploy CVE gate)
and runtime detection (watch syscalls/behaviour for exactly these escape patterns). Layers: no one
of them is sufficient, all of them together shrink the problem to noise. Vendor-neutral — we name
CATEGORIES next, not products.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Standards & frameworks · learn from the field, name no vendor</span>

# Where to go deeper

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="NSA/CISA Kubernetes Hardening Guidance" icon="📕" variant="ok">
      Government-authored, vendor-neutral hardening baseline: pod security, network separation,
      authentication, audit logging, upgrade hygiene. A checklist you can adopt wholesale.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="MITRE ATT&CK for Containers" icon="🗺️" variant="ok">
      A catalogue of real adversary techniques mapped to containers/Kubernetes —
      <em>Escape to Host</em>, <em>privileged container</em>, credential access. Use it to reason
      about what you're defending against.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-3 text-sm">

<span class="kw-kicker">tool categories — pick a tool per category; this workshop endorses none</span>

<div class="mt-1" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
  <KwCard heading="Benchmark scanner" icon="✅" variant="ok">
    Audits a cluster against a hardening benchmark (e.g. the CIS Kubernetes Benchmark) and reports
    drift.
  </KwCard>
  <KwCard heading="Image scanner" icon="🔎" variant="ok">
    Scans images for known CVEs and misconfigurations <strong>before</strong> they're deployed.
  </KwCard>
  <KwCard heading="Runtime detector" icon="🚨" variant="ok">
    Watches syscalls/behaviour at <strong>runtime</strong> and alerts on escape patterns as they
    happen.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: two named references — both are standards bodies / frameworks, named without endorsement,
which is exactly what belongs here. NSA/CISA Kubernetes Hardening Guidance is a free, government,
vendor-neutral document — the fastest way to a defensible baseline; point people at it as required
reading. MITRE ATT&CK for Containers is the shared vocabulary for adversary behaviour — the escape
we did maps to its "Escape to Host" technique; it's how blue teams reason about coverage. Then the
tool CATEGORIES, deliberately unbranded: a benchmark scanner (audits the cluster against a hardening
benchmark such as the CIS Kubernetes Benchmark — CIS is a standard, not a product), an image scanner
(pre-deploy CVE gate), a runtime detector (behavioural alerts). Say explicitly: pick one tool per
category on your own criteria — this workshop endorses none. Keep it vendor-neutral out loud.
-->

---
layout: recap
heading: 'Debrief — you saw the escape so you could close it'
story: 'A privileged Pod with the host root mounted read the node''s filesystem. Then one namespace label — enforce: restricted — rejected that exact Pod at admission, before it could ever exist.'
next: 'Day 3 security track complete — image hygiene (S02), pod security (S17), network policy (S18), and the escape they defend against, all one story'
---

- A container is a **process on the host kernel**, not a VM — isolation is *configuration*, and the
  wrong settings escape it
- The escape levers: **`privileged`**, **`hostPath: /`**, **`hostPID`/`hostNetwork`**, the
  **runtime socket**, **`SYS_ADMIN`/`SYS_PTRACE`** — each hands over a piece of the host
- **`restricted` PSA is the primary block** — it forbids every one of those settings and rejects
  the Pod **at admission, before it exists** (S17)
- **Defence in depth:** image hygiene (S02) + restricted admission (S17) + NetworkPolicy (S18) +
  image scanning + runtime detection — no single layer is enough
- Go deeper with **NSA/CISA Hardening Guidance** and **MITRE ATT&CK for Containers**; the lab does
  this **kind-only, defensively** — demonstrate access, then block it

<!--
Speaker: land the arc. We did something scary on purpose and in a sandbox so you'd recognise it and,
more importantly, know the one control that stops it. The mental model is the through-line: a
container is a fenced process on a shared kernel, and dangerous Pod fields un-fence it. The five
escape levers all give away host resources. `restricted` Pod Security Admission is the primary
defence — it forbids ALL of them and does so at admission, so the Pod never exists (contrast: a
runtime detector catches it AFTER, which is why you want both). Defence in depth ties the whole Day-3
security track together: S02 shrinks the foothold, S17 blocks the manifest, S18 contains the blast,
scanning/detection cover the gaps. Send them to NSA/CISA + MITRE ATT&CK for the real-world map. Then
the lab: strictly kind-only, a context-check.sh gates it, we read ONE benign file to prove access,
delete the Pod, label the namespace restricted, and watch the same Pod get rejected. Defensive from
start to finish.
-->

---
layout: lab
lab: labs/day-3/25-pod-escape.md
duration: 30 min
env: kind-only · strictly defensive
---

## Lab 25 — Escape, then block it

- **Guarded start:** `context-check.sh` refuses to run unless you're on a **kind** context
- In a **permissive** namespace: apply a `privileged` + `hostPath: /` Pod and read **one benign
  node file** (`/host/etc/os-release`) to prove host access — no secrets, no writes
- **Fix:** delete the Pod, label the namespace `enforce=restricted`, **re-apply the same Pod** →
  watch PSA **reject it at admission** with the privileged/hostPath violations
- Apply the **hardened** manifest → admitted and running; panic-reset = **delete the kind cluster**

---
layout: section-cover
image: /covers/section-17-armour-fitting.png
day: Day 3
section: '17'
tier: core
track: Security
---

# Pod security

Harden a Pod; understand Pod Security Standards.

**core** · suggested Day 3 · Security track

<!--
Section S17 — Pod security (securityContext + Pod Security Standards / Admission).
Opens Day 3 (M5). Timing: ~30 min slides + 25 min lab. Outcome: learners can harden a Pod
to the `restricted` standard by setting the FOUR fields it gates, explain why PSA rejects a
Pod at admission (before it exists), and distinguish admission enforcement (PSA) from the
runtime enforcement the kubelet applies (runAsNonRoot on an image that runs as root → CrashLoop).
Beats: problem (root + writable rootfs on a shared kernel → foreshadows S25) · mental model
(container vs pod-level securityContext; PSS ladder privileged/baseline/restricted) ·
code-annotated (the four restricted gates) · magic-move (insecure → four gates PASS restricted →
+readOnlyRootFilesystem, BEYOND restricted) · S02 callback + the runtime landmine · PSA via
namespace labels (enforce/warn/audit) · AdmissionGate animation · recap → S25 · lab.
Animation: AdmissionGate.vue (new, self-contained) — request → PSA check → deny then admit.
ACCURACY LOCKS (verified against the current Pod Security Standards doc):
- `restricted` gates EXACTLY four spec fields for a plain Pod: runAsNonRoot:true,
  allowPrivilegeEscalation:false, capabilities.drop:["ALL"], seccompProfile RuntimeDefault|Localhost.
- readOnlyRootFilesystem is NOT a restricted requirement — it's beyond-restricted hardening,
  authored as the FINAL magic-move step and the lab's post-admission break→fix.
- runAsNonRoot passes PSA admission when the field is set, but the KUBELET enforces at runtime:
  a stock root image admits then CrashLoops ("container has runAsNonRoot and image will run as
  root"). We use nginxinc/nginx-unprivileged so the harden lab actually runs.
CKx tie-in: CKAD securityContext + CKA admission/security hardening.
-->

---
layout: statement
kicker: The problem
---

Your container shares the host's **kernel** — and by default it runs as **root** on it.

Every earlier `web` Pod ran as **UID 0** with a **writable root filesystem** and the full set
of Linux capabilities. On a shared node that's one kernel bug — or one compromised
dependency — away from a container that can write where it shouldn't, add capabilities, or
climb toward the host. Least privilege isn't paperwork here; it's the blast radius.

<!--
Speaker: the "why care" beat, and it foreshadows S25 (pod escape). A container is not a VM —
it's a process on the HOST kernel, isolated by namespaces + cgroups (callback to S01/S03). If
the process is root and the isolation has a hole, root-in-container is a long way toward
root-on-node. Two concrete defaults to name: (1) most images run as UID 0 unless told otherwise;
(2) the root filesystem is writable, so a foothold can drop tools/binaries. This section gives
you the two levers that shrink the blast radius: the Pod's own `securityContext` (what the Pod
asks to be) and Pod Security Admission (what the platform will let in). S25 turns these same
knobs into named defences against a real escape.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · two questions, two mechanisms</span>

# What the Pod asks for · what the platform allows

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="securityContext — what the Pod requests" kind="pod" variant="ok">
      Fields on the <strong>Pod</strong> and each <strong>container</strong>:
      <code>runAsNonRoot</code>, <code>runAsUser</code>, <code>capabilities</code>,
      <code>allowPrivilegeEscalation</code>, <code>seccompProfile</code>,
      <code>readOnlyRootFilesystem</code>. You set these.
      <div class="kw-muted mt-1">Container-level overrides Pod-level where they overlap.</div>
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Pod Security Standards — what the platform requires" icon="🛡️" variant="warn">
      Three named profiles the cluster can <strong>enforce</strong> at admission. A ladder,
      loosest → strictest.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the ladder — Pod Security Standards</span>

<div class="mt-1" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:0.8rem;">
  <KwCard heading="privileged" icon="🔓" variant="danger">
    Wide open. No restrictions — for trusted infra/system workloads only.
  </KwCard>
  <KwCard heading="baseline" icon="🚧" variant="warn">
    Blocks the known-dangerous: no privileged, host namespaces, hostPath, etc.
  </KwCard>
  <KwCard heading="restricted" icon="🔒" variant="ok">
    Baseline <strong>plus</strong> least-privilege: non-root, no priv-esc, drop caps, seccomp.
  </KwCard>
</div>

</div>

</div>

<!--
Speaker: separate the two ideas cleanly, because learners fuse them. securityContext is what
YOUR manifest declares — Pod-level (spec.securityContext) sets defaults for all containers,
container-level (spec.containers[].securityContext) overrides for one; container wins on
overlap. Pod Security STANDARDS are the CNCF-defined profiles — privileged (no-op), baseline
(blocks the obviously dangerous — hostNetwork, privileged, hostPath…), restricted (baseline +
least privilege). It's a ladder: each rung is a superset of the one below. The platform picks a
rung per namespace and the built-in admission controller checks your Pod against it. Next slide:
exactly which fields `restricted` checks — it's a short, learnable list.
-->

---
layout: code-annotated
heading: 'The four fields `restricted` actually checks'
compact: true
lab: labs/day-3/17-pod-security.md
---

```yaml {none|3|4|5-6|7-8|all}
spec:
  containers:
    - name: web
      securityContext:
        runAsNonRoot: true                 # 1
        allowPrivilegeEscalation: false    # 2
        capabilities:
          drop: ["ALL"]                    # 3
        seccompProfile:
          type: RuntimeDefault             # 4
```

::notes::

<CodeNote at="1" label="1 · runAsNonRoot" variant="ok">
The container must <strong>not</strong> run as UID 0. This is a <em>promise the image has to
keep</em> — see the next slide.
</CodeNote>

<CodeNote at="2" label="2 · no privilege escalation" variant="ok">
Blocks <code>setuid</code>-style gaining of more privileges than the parent — no
<code>sudo</code>-ing your way up inside the container.
</CodeNote>

<CodeNote at="3" label="3 · drop ALL capabilities" variant="ok">
Start from zero Linux capabilities. <code>restricted</code> lets you <code>add</code> back only
<code>NET_BIND_SERVICE</code> if you truly need a low port.
</CodeNote>

<CodeNote at="4" label="4 · seccompProfile: RuntimeDefault" variant="ok">
Apply the runtime's default syscall filter (<code>RuntimeDefault</code> or
<code>Localhost</code>) — shrinks the reachable kernel surface.
</CodeNote>

<div v-click="5" class="mt-2 text-sm kw-muted">
Set these four and a plain Pod satisfies <code>restricted</code>. That's the whole checklist
the admission gate runs.
</div>

<!--
Speaker: this is the memorise-this slide. For a PLAIN Pod (no host namespaces, no volumes to
worry about), `restricted` gates exactly these four fields — nothing else. runAsNonRoot=true,
allowPrivilegeEscalation=false, capabilities.drop must contain ALL (you may add back only
NET_BIND_SERVICE), and seccompProfile.type is RuntimeDefault or Localhost. Set at the container
level here; three of them (runAsNonRoot, seccompProfile) can also sit at Pod level to cover all
containers at once. If a learner asks "what about readOnlyRootFilesystem?" — hold it, it's the
next-but-two slide, and it is NOT one of these four. The lab clears these violations one at a
time; the exact violation strings come straight from the admission controller.
-->

---
layout: code-walkthrough
heading: 'Harden it up — insecure Pod → passes `restricted` → beyond'
lab: labs/day-3/17-pod-security.md
---

````md magic-move
```yaml
# 0: as it ran all along — root, full caps, writable rootfs. REJECTED by restricted.
apiVersion: v1
kind: Pod
metadata: { name: web, labels: { app: s17 } }
spec:
  containers:
    - name: web
      image: nginxinc/nginx-unprivileged:1.27
      # (no securityContext at all)
```

```yaml
# 1: +runAsNonRoot / runAsUser — clears "runAsNonRoot != true"
spec:
  containers:
    - name: web
      image: nginxinc/nginx-unprivileged:1.27
      securityContext:
        runAsNonRoot: true
        runAsUser: 101                     # the image's built-in non-root user
```

```yaml
# 2: +allowPrivilegeEscalation:false — clears "allowPrivilegeEscalation != false"
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        allowPrivilegeEscalation: false
```

```yaml
# 3: +drop ALL capabilities — clears "unrestricted capabilities"
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
```

```yaml
# 4: +seccompProfile — clears the last gate. NOW IT PASSES `restricted`.
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        seccompProfile:
          type: RuntimeDefault
```

```yaml
# 5: +readOnlyRootFilesystem — BEYOND restricted (not required), defence-in-depth.
      securityContext:
        runAsNonRoot: true
        runAsUser: 101
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
        seccompProfile: { type: RuntimeDefault }
        readOnlyRootFilesystem: true       # now the app can't write to / — needs emptyDir
```
````

<!--
Speaker: SIX frames, and the caption boundary matters. Frames 0→4 each clear ONE restricted
violation, in the same order the admission controller lists them; by frame 4 all four gates
pass and the Pod is admitted. STOP and say it: frame 4 is `restricted`-compliant. Frame 5 adds
readOnlyRootFilesystem — call out explicitly that this is NOT part of restricted, it's extra
hardening (and it's what the lab breaks: a read-only root filesystem stops nginx writing its
cache/pid, so you add emptyDir mounts for those paths). Image note: nginxinc/nginx-unprivileged
already runs as UID 101 and listens on 8080, so runAsNonRoot is a promise it keeps — which is
exactly the runtime point on the next slide. The lab applies these frames as real files and
watches the gate flip from Forbidden to created.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Callback to image hygiene · admission ≠ runtime</span>

# `runAsNonRoot` is a promise the image must keep

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Admission checks the field" kind="pod" variant="ok">
      PSA sees <code>runAsNonRoot: true</code> is <em>set</em> and admits the Pod. That's all
      admission can know — it reads YAML, not the image.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="The kubelet checks reality" icon="💥" variant="danger">
      At start, if the image's effective user is <strong>root</strong>, the kubelet refuses to
      run it:
      <div class="kw-muted mt-1"><code>container has runAsNonRoot and image will run as root</code>
      → <strong>CreateContainerError → CrashLoopBackOff</strong>.</div>
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">so the image has to actually be non-root</span>

Either the image sets a non-root `USER` (this is exactly the **non-root image you built in
S02**), or you pin `runAsUser` to a real non-root UID the image can run as. We use
`nginxinc/nginx-unprivileged` — it ships as UID **101** and listens on **8080**, so the promise
holds and the Pod runs.

</div>

</div>

<!--
Speaker: this is the landmine that bites everyone, and it's the honest S02 tie-in. runAsNonRoot:
true is not "make me non-root" — it's an ASSERTION the platform verifies two different ways.
Admission (PSA) only checks the field is present, so it admits. The kubelet, at container
create, resolves the image's effective UID; if that's 0 and runAsNonRoot is true, it errors with
"container has runAsNonRoot and image will run as root" — the Pod exists but never starts
(CreateContainerError → CrashLoopBackOff). The fix is not a securityContext field — it's the
IMAGE: build it non-root (S02's multi-stage, non-root USER) or set runAsUser to a UID the image
actually supports. Standard nginx runs as root and would hit this; nginx-unprivileged runs as
101, so our hardened Pod actually serves traffic. Point back to S02: the reason we did all that
image hygiene is so runtime hardening like this is even possible.
-->

---
layout: code-annotated
heading: 'Enforcement lives on the namespace — three labels'
compact: true
lab: labs/day-3/17-pod-security.md
---

```yaml {none|2-3|4|5|all}
metadata:
  labels:
    pod-security.kubernetes.io/enforce: restricted        # reject violators
    pod-security.kubernetes.io/warn: restricted           # warn on kubectl
    pod-security.kubernetes.io/audit: restricted          # record in audit log
```

::notes::

<CodeNote at="1" label="enforce — the one with teeth" variant="danger">
Violating Pods are <strong>rejected at admission</strong>. This is the label the lab flips; the
other two never block.
</CodeNote>

<CodeNote at="2" label="warn — a heads-up to the author" variant="warn">
Pod is still created, but <code>kubectl</code> prints a <code>Warning:</code> for each
violation. Great for a soft rollout.
</CodeNote>

<CodeNote at="3" label="audit — a note for the cluster log" variant="ok">
Records the violation in the API audit log — invisible to the user, visible to the platform team.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
PSA is <strong>built in</strong> — no controller to install. Each label also takes a pinned
version (<code>…/enforce-version: v1.34</code>). Add <code>warn</code> before <code>enforce</code>
to migrate a namespace without breaking anyone.
</div>

<!--
Speaker: Pod Security ADMISSION is how a Standard gets applied — and it's namespace-scoped
LABELS, nothing to install (built into the API server since 1.25, stable). Three independent
modes, each can name a different profile and version: enforce (reject — the only one that
blocks), warn (create anyway, but return a Warning to kubectl — the author sees it), audit
(create anyway, write it to the audit log — the platform sees it). The migration play, worth
saying: label warn+audit=restricted first, watch what would break via warnings/audit, fix the
workloads, THEN switch enforce=restricted. Version pin (enforce-version: v1.34) freezes the
ruleset so a cluster upgrade doesn't silently tighten it. The lab sets enforce (kind) or uses a
pre-labelled namespace (shared cluster). Next: watch the gate rule, live.
-->

---

<span class="kw-kicker">Same gate, same namespace — the manifest is what changed</span>

# The admission gate, live

<div class="mt-2">
  <AdmissionGate :step="$clicks" :show-caption="false" />
</div>

<div class="mt-3 text-sm">
<v-clicks at="1">

- A bare Pod (root, no `securityContext`) is submitted to an `enforce: restricted` namespace.
- PSA checks it **before it's stored** — all four gates fail → **Forbidden**, and **nothing is
  created**.
- Set the four fields and re-apply the *same* Pod…
- …every gate passes → **admitted** and scheduled. Policy didn't move; the Pod did.

</v-clicks>
</div>

<!--
Speaker: drive with clicks; this makes the admission moment physical, and it's exactly the lab.
(0) the insecure Pod heading for the gate. (1) the gate rules — four red ✗, verdict DENIED
(Forbidden); crucial point: the Pod is NEVER created, there's nothing to kubectl get, nothing to
delete — contrast with the runtime failures from S13/S14 where the Pod exists and misbehaves.
This is admission enforcement: the API server said no before etcd ever saw it. (2) re-apply the
hardened version. (3) four green ✓, ADMITTED, Pod lands in the namespace Running. The takeaway:
you didn't change the policy or beg an admin — you changed your manifest to meet the bar. That's
the whole loop the learner runs in Lab 17.
-->

---
layout: recap
heading: 'Recap — least privilege, and who enforces it when'
story: 'The insecure Pod was refused before it existed (admission); the same Pod, hardened, walked straight in. readOnlyRootFilesystem then broke the app at runtime — a different layer, a different fix.'
next: 'S18 · NetworkPolicy — the network complement: default-deny pod-to-pod traffic and explicit allows'
---

- **`securityContext`** = what the Pod asks to be; **Pod Security Standards** = privileged →
  baseline → **restricted**, the platform's bar
- `restricted` gates **four** fields: `runAsNonRoot` · `allowPrivilegeEscalation:false` ·
  `drop ["ALL"]` · `seccompProfile` — set them and you're in
- **`readOnlyRootFilesystem` is *beyond* restricted** — great hygiene, but it can break apps
  that write to `/` (fix with an `emptyDir`)
- **PSA = namespace labels** (`enforce`/`warn`/`audit`), built in — `warn` first, then `enforce`
- Two layers: **admission** rejects before the Pod exists (PSA); the **kubelet** enforces at
  runtime (`runAsNonRoot` on a root image → CrashLoop) — sets up **S25** pod-escape defences

<!--
Speaker: land the two-layer mental model, because it's the thread through the rest of Day 3.
ADMISSION (PSA) decides whether the Pod may exist at all — pure YAML check, namespace-scoped,
happens before storage. RUNTIME (kubelet + kernel: seccomp, caps, the runAsNonRoot reality
check, readOnlyRootFilesystem) governs what the Pod may DO once it's running. `restricted` is
four fields; readOnlyRootFilesystem is a fifth good habit that's NOT part of it and needs an
emptyDir when the app writes to disk. Migrate namespaces with warn→enforce so you never surprise
a team. All of this is the toolkit S25 uses against a real pod escape, and it pairs with S18
(NetworkPolicy) for the network side. Hand to Lab 17: label a namespace restricted, get your
insecure Pod refused, harden it field by field until the gate admits it, then meet
readOnlyRootFilesystem and give it a writable path.
-->

---
layout: lab
lab: labs/day-3/17-pod-security.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 17 — Pass `restricted`

- Label a namespace `enforce=restricted` (kind) or use your pre-labelled shared namespace
- **Break:** apply a bare, root, no-context Pod → **Forbidden**; read the four-violation list
- **Fix:** add the four fields one at a time, re-applying until the gate **admits** it
- Turn on `readOnlyRootFilesystem`, watch the app fail to write, and give it an `emptyDir`
- Confirm with `kubectl exec … id` (non-root UID) and that writes to `/` are refused

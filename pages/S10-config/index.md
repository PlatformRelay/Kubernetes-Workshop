---
layout: section-cover
image: /covers/section-10-scroll-library-vault.png
day: Day 2
section: '10'
tier: core
track: Core
---

# ConfigMap & Secret

Separate configuration from the image — inject it as env or files, know what a Secret
does and doesn't protect, and learn why changing config doesn't restart your Pods.

**core** · suggested Day 2 · Core track

<!--
Section S10 — ConfigMap & Secret. Timing: ~25 min slides + 25 min lab. First
config-layering section of Day 2 (the red line ended at S09). Outcome: learners can
externalise config into a ConfigMap/Secret, consume it three ways (env via envFrom,
mounted files, Secret as env), explain that base64 is encoding not encryption (etcd
encryption-at-rest + RBAC are the real controls), and — the sharp edge — know that
updating a ConfigMap/Secret does NOT restart Pods: env is frozen at start, whole-dir
mounted files update eventually (~60–90s), subPath mounts never update. The
checksum-annotation trick forces a rollout on purpose.
Beats: problem (config baked in → rebuild per env) · mental model (two objects, two
consumption modes, subPath caveat) · magic-move (extend the web Deployment: +envFrom
→ +mounted file → +Secret env) · security (base64 ≠ encryption; Secret types) ·
immutability (immutable: true tradeoff) · rotation gotcha (what updates, what doesn't;
checksum trick) · debrief → lab.
No shared animation (per outline S10 has none; the rotation story is a live console
sequence, not a state-machine). CKx: CKAD application-configuration.
-->

---
layout: statement
kicker: The problem
---

Bake config into the image and you rebuild it for **every** environment.

A connection string, a feature flag, a log level, an API token — hard-code them and dev,
staging, and prod each need their own image. The **same artifact** should run everywhere;
only the **config** changes around it. So config has to live **outside** the image — as
data the cluster injects at runtime.

<!--
Speaker: this is the twelve-factor "config in the environment" idea, made concrete for
Kubernetes. The image is the thing you built and scanned in S01/S02 — it should be
immutable and identical across environments. What differs per environment is
configuration, and Kubernetes gives you two objects to hold it: ConfigMap (non-secret)
and Secret (sensitive). Lab 10 follows this section.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · two objects, two ways in</span>

# ConfigMap and Secret — key/value, injected two ways

<div class="kw-cols-2 mt-2 text-sm">
  <v-click at="1">
    <KwCard heading="ConfigMap" kind="cm">
      Non-sensitive key/value: flags, URLs, tuning.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Secret" kind="secret" variant="warn">
      Sensitive values — <strong>base64</strong>, not encryption (next slide).
    </KwCard>
  </v-click>
</div>

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="3">
    <KwCard heading="As environment variables" icon="🌱">
      <code>envFrom</code> / <code>valueFrom</code> — simple, but <strong>frozen at start</strong>.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="As mounted files" icon="📄">
      Whole-directory mount <strong>updates in place</strong>; <code>subPath</code> never does.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-3 kw-muted text-sm">

Same objects, two consumption modes. The <code>subPath</code> caveat is what the rotation lab proves.

</div>

</div>

<!--
Speaker: build the four cards. Land two things hard: (1) a Secret is not encrypted, it's
just base64 + some guard rails (RBAC, no accidental logging) — the next slide is the
whole point. (2) The consumption mode decides update behaviour, and subPath is the
trap: subPath copies the file at mount time so it behaves like an env var (frozen),
while a directory mount tracks the object. This exact distinction is the lab's rotation
step and its headline question.
-->

---
layout: code-walkthrough
heading: 'Extend the app — consume config as env, files, and a Secret'
lab: labs/day-2/10-config.md
---

````md magic-move
```yaml
# our app from Day 1 — nothing consumes config yet
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1                       # one replica → exec/env is deterministic
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
```

```yaml
# +1: a ConfigMap injected as environment variables
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          envFrom:
            - configMapRef: { name: web-config }   # every key → an env var
```

```yaml
# +2: the SAME ConfigMap also mounted as files (whole directory → updatable)
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          envFrom:
            - configMapRef: { name: web-config }
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }   # dir mount, no subPath
      volumes:
        - { name: config, configMap: { name: web-config } }
```

```yaml
# +3: a Secret injected as one env var — same app, sensitive value kept apart
apiVersion: apps/v1
kind: Deployment
metadata: { name: web, labels: { app: s10 } }
spec:
  replicas: 1
  selector: { matchLabels: { app: s10 } }
  template:
    metadata: { labels: { app: s10 } }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          envFrom:
            - configMapRef: { name: web-config }
          env:
            - name: API_TOKEN
              valueFrom: { secretKeyRef: { name: web-secret, key: API_TOKEN } }
          volumeMounts:
            - { name: config, mountPath: /etc/web-config }
      volumes:
        - { name: config, configMap: { name: web-config } }
```
````

<!--
Speaker: FOUR frames, all the SAME Deployment growing. (1) the app from Day 1, no config.
(2) envFrom pulls every ConfigMap key in as an env var — one line. (3) the same ConfigMap
ALSO mounted as a directory of files — call out mountPath with NO subPath, that's the
updatable form (matters two slides on). (4) a Secret's key injected as one env var via
secretKeyRef — sensitive value lives in its own object, consumed the same way. The lab
applies these same pieces and execs in to prove each one. Note replicas:1 is deliberate:
one Pod makes `kubectl exec deploy/web -- env` unambiguous.
-->

---
layout: code-annotated
heading: 'A Secret is base64, not a vault'
lab: labs/day-2/10-config.md
---

```yaml {none|1-6|4-6|all}
apiVersion: v1
kind: Secret
metadata: { name: web-secret }
type: Opaque                 # also: kubernetes.io/tls, .../dockerconfigjson
data:
  API_TOKEN: czNjcjN0        # "s3cr3t" — base64, trivially reversible
```

::notes::

<BitHologram src="/diagrams/diagram-c10b-secret-base64.png" compact />

<CodeNote at="1" label="Secret ≈ ConfigMap">
Same key/value shape as a ConfigMap. The differences are handling, not cryptography:
it's kept out of most logs and gated by RBAC — that's it.
</CodeNote>

<CodeNote at="2" label="base64 ≠ encryption" variant="warn">
<code>echo czNjcjN0 | base64 -d</code> returns the value. Anyone who can
<code>get</code> the Secret can read it. The real controls are <strong>RBAC</strong>
(who can read it) and <strong>etcd encryption-at-rest</strong> (who can read the disk).
</CodeNote>

<CodeNote at="3" label="typed for a purpose" variant="ok">
<code>type</code> tells consumers what's inside: <code>Opaque</code> (arbitrary),
<code>kubernetes.io/tls</code> (cert/key for a listener), <code>.../dockerconfigjson</code>
(a registry pull secret — remember <code>imagePullSecrets</code> from S05).
</CodeNote>

<!--
Speaker: the single most misunderstood object in Kubernetes. Walk it: it's base64, decode
it live in your head — czNjcjN0 → s3cr3t. So a Secret protects you only as much as your
RBAC and etcd config do. Enable encryption-at-rest and lock down `get secrets`; that's
where the security actually lives. Then the types: Opaque is the default; tls and
dockerconfigjson are consumed by specific machinery. Lab decodes a real Secret with
`-o jsonpath | base64 -d` so the "not encrypted" point is felt, not just told.
-->

---

<span class="kw-kicker">Safety valve · lock a value down</span>

# Immutable config — faster and safer, but frozen

<div class="kw-cols-2 mt-3 text-sm">
  <KwCard heading="immutable: true" icon="🔒">
    Set it on a ConfigMap or Secret and the value can <strong>never</strong> change.
    To roll a new value you create a <strong>new object</strong> and repoint the
    Deployment.
  </KwCard>
  <KwCard heading="Why bother" icon="⚡">
    The kubelet stops watching immutable objects for changes — <strong>less API load</strong>
    at scale — and an accidental edit can't silently reconfigure live Pods.
  </KwCard>
</div>

<div v-click class="mt-4 kw-muted text-sm">

The tradeoff is in the name: no in-place edits. It pairs naturally with treating each
config version as a **new, named object** — which is exactly how you roll changes safely
(next slide).

</div>

<!--
Speaker: quick beat, don't linger. immutable: true is a performance + safety lever:
kubelet drops the watch (real savings when thousands of Pods mount the same object) and
fat-fingered edits are impossible. Cost: you can't edit it — new value means new object.
That segues straight into the rotation gotcha: even for MUTABLE objects, changing them
doesn't restart Pods, so you end up managing config by version anyway.
-->

---
layout: code-annotated
heading: 'Changing config does not restart your Pods'
compact: true
lab: labs/day-2/10-config.md
---

```console {none|1-3|5-6|8-10}
# 1) edit the ConfigMap
$ kubectl edit configmap web-config    # GREETING: hi → hello
$ kubectl exec deploy/web -- printenv GREETING
hi                                      # frozen at Pod start

# 2) mounted file updates (~60–90s)
$ kubectl exec deploy/web -- cat /etc/web-config/GREETING
hello

# 3) force rollout — checksum annotation
$ kubectl patch deploy web -p '{"spec":{"template":{"metadata":{"annotations":{"checksum/config":"<sha>"}}}}}'
```

::notes::

<BitHologram src="/diagrams/diagram-c10-config-rotation.png" compact />

<CodeNote at="1" label="env is frozen" variant="warn">
Environment variables are read <strong>once</strong>, when the container starts. Editing
the ConfigMap changes the object, not the running process — the old value persists until
the Pod is recreated.
</CodeNote>

<CodeNote at="2" label="files update, eventually">
A whole-directory volume mount tracks the object: the kubelet refreshes it within about a
minute. (A <code>subPath</code> mount would <strong>not</strong> — it's copied once.)
</CodeNote>

<CodeNote at="3" label="the checksum trick" variant="ok">
Nothing auto-restarts Pods on a config change. Teams put a hash of the config in a
<strong>pod-template annotation</strong>: change the config → change the hash → the
template changes → a normal rolling update ships the new value.
</CodeNote>

<!--
Speaker: this is the beat people get burned by in production. Three outcomes from ONE
edit: (1) env var unchanged — frozen at start; (2) directory-mounted file updates after
~60–90s — reassure them the delay is normal, it's not broken; (3) if you need env to
change now, you must roll the Pods, and the idiom is a checksum/config annotation on the
pod template (Helm/Kustomize automate this). Tie back: immutable objects push you to
name-per-version anyway. The lab walks all three outcomes and asks the learner to explain
why env didn't change but the file did.
-->

---
layout: recap
heading: 'Debrief — config lives outside the image'
story: 'Ops edited the ConfigMap and wondered why the app still said "hi" — env was frozen; the mounted file caught up a minute later.'
next: 'S11 · Storage — give the app a volume that survives a restart (Day 2 continues)'
---

- **ConfigMap** (non-secret) and **Secret** (sensitive) hold key/value config so one image
  runs in every environment
- Consume either as **env vars** (`envFrom` / `valueFrom`) or as **mounted files** — the
  same app, two ways in
- A **Secret is base64, not encryption**: real protection is **RBAC** + **etcd
  encryption-at-rest**; `type` (`Opaque` / `tls` / `dockerconfigjson`) tells consumers what's inside
- **`immutable: true`** trades in-place edits for less API load and no accidental change —
  roll a new value as a new object
- **Updates don't restart Pods:** env is **frozen at start**, whole-dir files update in
  ~60–90s, `subPath` never updates — force a rollout with a **checksum annotation**
- Next: the app is configurable — now make its **data durable** with a volume (S11)

<!--
Speaker: leave them with the update matrix — it's the practical takeaway they'll reach for
in an incident: "I changed the ConfigMap and nothing happened" is env-frozen, not a bug.
Then pivot to Day 2's storage arc: config is externalised, but the app's DATA is still
ephemeral — a restart loses it. That's S11. Hand off to Lab 10: inject config as env and
files, decode a Secret, and rotate a value to watch exactly what does and doesn't change.
-->

---
layout: lab
lab: labs/day-2/10-config.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 10 — Config in, secrets rotated

- Create a **ConfigMap**; consume it as **env** (`envFrom`) and prove it with `exec … printenv`
- Mount the **same** ConfigMap as **files**; `cat` a mounted key
- Create a **Secret**, consume it as env, and decode it — see the base64, feel "not encrypted"
- **Rotate:** edit the ConfigMap → env is **unchanged**, the mounted file updates, then a
  **checksum annotation** forces a rollout
- Answer the headline: *why did the env var not change but the mounted file did?*

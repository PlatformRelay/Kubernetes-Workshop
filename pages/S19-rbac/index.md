---
layout: section-cover
image: /covers/section-19-keymaster.png
day: Day 3
section: '19'
tier: optional
track: Security
---

# RBAC

Grant least-privilege access: who may do what, to which resources.

**optional** · suggested Day 3 · Security track

<!--
Section S19 — RBAC (Role-Based Access Control). Day 3 (M5), Security track, optional tier. The
authorization complement to S17/S18: S17 hardened what a Pod IS, S18 controlled what a Pod may
TALK to, S19 controls what an identity may DO to the API. Timing: ~25 min slides + 25 min lab.
Outcome: learners can name the subject × verb × resource model, pick Role vs ClusterRole and
RoleBinding vs ClusterRoleBinding, build a read-only Role + ServiceAccount + RoleBinding, and
verify effective permissions with `kubectl auth can-i` (incl. `--as` impersonation).
Beats: problem (a ServiceAccount that can do too much / too little — "who is allowed to do
this?") · mental model (subjects × verbs × resources, tied by a binding) · 2x2 (Role vs
ClusterRole, RoleBinding vs ClusterRoleBinding — namespaced vs cluster-wide) · magic-move (build
Role → ServiceAccount → RoleBinding field by field; final frame == the lab's manifest,
byte-for-byte) · can-i / --as (the verification tool; impersonate to test another identity) ·
ServiceAccount tokens + the default SA (foreshadow S21 Argo CD & S22 operators run AS SAs) ·
recap → S21 · lab.
Animation: NONE. RBAC has no state transition to animate (per the outline); the model is a static
join (subject–binding–role). Use the 2x2 comparison + magic-move + cards. Do NOT add a component.

ACCURACY LOCKS (verified against current RBAC docs, rbac.authorization.k8s.io/v1):
- Four objects: Role + RoleBinding (namespaced) and ClusterRole + ClusterRoleBinding
  (cluster-wide). apiVersion is rbac.authorization.k8s.io/v1 for all four.
- A Role/ClusterRole is a pure ALLOW list of rules (apiGroups × resources × verbs). There is NO
  deny. Default is deny — no matching rule = forbidden.
- A RoleBinding grants a Role (or a ClusterRole) to subjects WITHIN ITS namespace. A
  ClusterRoleBinding grants a ClusterRole cluster-wide. A RoleBinding can reference a ClusterRole
  to reuse one definition per-namespace (common idiom, mentioned in notes).
- Subjects: User, Group, ServiceAccount. Users/Groups are NOT k8s objects (the API trusts the
  authenticator); ServiceAccounts ARE namespaced objects.
- `kubectl auth can-i VERB RESOURCE` answers yes/no for the CURRENT identity; `--as` impersonates
  another subject (needs the `impersonate` verb — caller must hold it; on kind you are
  cluster-admin so it works). `--list` dumps the effective rule set.
- Every Pod gets a ServiceAccount (the namespace's `default` SA if unset); its token is projected
  at /var/run/secrets/kubernetes.io/serviceaccount/. The default SA has almost no permissions.
CKx tie-in: CKA & CKAD Security — RBAC (Roles, RoleBindings, ServiceAccounts) is a core exam item.
-->

---
layout: statement
kicker: The problem
---

Your app has a token to the API. **Who decided what it's allowed to do?**

Every Pod runs as a **ServiceAccount**, and that identity carries a token the API server trusts.
Leave it unset and it's the namespace's **`default`** SA — which can do almost nothing, so your
controller silently fails to list Pods. Over-grant it (the tempting fix: bind it to
**`cluster-admin`**) and one compromised Pod now owns the cluster. Neither "too little" nor "too
much" is an accident of Kubernetes — **you** answer *"who may do what"*, or you inherit a default.

<!--
Speaker: the "why care" beat, continuing the Day-3 security arc. S17 shrank what a Pod can DO to
the node; S18 shrank what a Pod can TALK to; S19 is the third axis — what an identity may do to
the KUBERNETES API. Frame it as a Goldilocks problem the audience has hit: a controller that
can't list its own resources (too little — bound to nothing, or the near-powerless default SA),
versus the copy-paste disaster of binding a workload to cluster-admin so it "just works" (too
much — now a foothold in that Pod is a foothold in the whole cluster). RBAC is how you answer the
question deliberately: subject × verb × resource, least privilege. Hold that: authorization is
"who may do what," and the default is DENY.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · a subject, a set of allowed actions, and the join</span>

# RBAC = *who* × *what verb* × *which resource* — tied by a **binding**

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Role — the allowed actions" icon="📜" variant="ok">
      A <strong>Role</strong> is a pure <strong>allow-list</strong> of rules:
      <em>verbs</em> (<code>get</code>, <code>list</code>, <code>create</code>, <code>delete</code>…)
      on <em>resources</em> (<code>pods</code>, <code>secrets</code>…). No deny exists — the
      default is <strong>deny</strong>, so an action with no matching rule is forbidden.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Subject — the who" kind="sa" variant="ok">
      A <strong>User</strong>, a <strong>Group</strong>, or a
      <strong>ServiceAccount</strong>. Users/Groups aren't Kubernetes objects (the API trusts the
      authenticator); a <strong>ServiceAccount</strong> <em>is</em> a namespaced object your Pods
      run as.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">the join is the whole point</span>

A Role grants nothing on its own, and a subject starts with nothing. A **binding** is the join:
*"give **these subjects** the verbs in **this Role**."* No binding, no access. That's the entire
model — **subject × verb × resource, connected by a binding** — and everything else is just
*namespaced vs cluster-wide*.

</div>

</div>

<!--
Speaker: three pieces, in order. (1) A Role is an allow-list — rules of (apiGroups, resources,
verbs). Critically there is NO deny rule in RBAC; permissions are purely additive and the baseline
is deny, so "not allowed" = "no rule said yes." (2) The subject — who you're granting to. Three
kinds: User, Group, ServiceAccount. Users and Groups are NOT objects in the cluster — Kubernetes
doesn't create them; an external authenticator (certs, OIDC) asserts them and RBAC just references
the string. ServiceAccounts ARE real namespaced objects, and they're what workloads use. (3) The
join: a Role and a subject never touch until a BINDING wires them together. This is the #1 beginner
miss — they write a perfect Role, nothing works, because nothing is bound. Say the sentence:
"subject times verb times resource, tied by a binding." Next slide: the four objects are just this
model at two scopes.
-->

---
layout: comparison
heading: 'Two scopes × two objects — the RBAC 2×2'
leftHeading: 'Role  ·  RoleBinding'
rightHeading: 'ClusterRole  ·  ClusterRoleBinding'
leftBadge: namespaced
rightBadge: cluster-wide
---

<div class="text-sm">

**`Role`** — rules that apply **inside one namespace**. Names namespaced resources
(`pods`, `configmaps`, `secrets`).

**`RoleBinding`** — grants a Role (or a ClusterRole) to subjects, **scoped to its own
namespace**. This is our lab: a Role + a RoleBinding, all in your namespace.

<div class="mt-2 kw-muted">
Use when: least-privilege access to resources <strong>in one namespace</strong> — the common,
safe default.
</div>

</div>

::right::

<div class="text-sm">

**`ClusterRole`** — rules that apply **cluster-wide**, and the only way to name
**cluster-scoped** resources (`nodes`, `namespaces`, `persistentvolumes`) or non-resource URLs
(`/healthz`).

**`ClusterRoleBinding`** — grants a ClusterRole across **every** namespace at once.
`cluster-admin` is a ClusterRole; binding a workload to it is the over-grant from slide 1.

<div class="mt-2 kw-muted">
Use when: cluster-scoped resources, or one definition reused in <strong>many</strong>
namespaces (a ClusterRole named by a per-namespace RoleBinding).
</div>

</div>

<!--
Speaker: the 2x2 that answers "which of the four do I reach for." One axis is the ROLE (what):
Role = rules that only mean something inside a namespace; ClusterRole = rules that can span the
cluster AND the only way to reference cluster-scoped resources like nodes/namespaces/PVs (those
live outside any namespace, so a namespaced Role literally cannot name them). The other axis is
the BINDING (where the grant lands): RoleBinding = grant confined to its own namespace;
ClusterRoleBinding = grant applies in every namespace. The powerful middle case: a RoleBinding may
reference a ClusterRole — you define "read-only pods" once as a ClusterRole and bind it
per-namespace, so the grant stays namespaced but the definition is shared. cluster-admin is just a
built-in ClusterRole; the disaster is binding a Pod's SA to it with a ClusterRoleBinding. Our lab
takes the safe corner: Role + RoleBinding, entirely inside your namespace — no cluster-admin
needed. This is a core CKA/CKAD item: know all four and when each applies.
-->

---
layout: code-walkthrough
heading: 'Build it: Role → ServiceAccount → RoleBinding'
lab: labs/day-3/19-rbac.md
---

````md magic-move
```yaml
# 1 — a read-only Role: verbs on a resource, in ONE namespace
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = the core API group (pods live here)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # read-only: no create/delete
```

```yaml
# 2 — the subject: a ServiceAccount your workload will run as
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
```

```yaml
# 3 — the JOIN: bind the Role to the ServiceAccount (same namespace)
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

```yaml
# all three — the exact manifest Lab 19 applies (byte-for-byte)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  labels: { app: s19 }
rules:
  - apiGroups: [""]                 # "" = the core API group (pods live here)
    resources: ["pods"]
    verbs: ["get", "list", "watch"] # read-only: no create/delete
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: pod-reader-sa
  labels: { app: s19 }
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  labels: { app: s19 }
subjects:
  - kind: ServiceAccount
    name: pod-reader-sa
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```
````

<!--
Speaker: FOUR frames, one per object then the whole file. Frame 1 — the Role: the rule is
(apiGroups, resources, verbs). apiGroups: [""] is the CORE group where pods live (the empty
string, NOT "core" as text — a classic gotcha; apps/, batch/, rbac.authorization.k8s.io/ are named
groups). verbs get/list/watch = read-only; note there is no create or delete, which is exactly the
break the lab hits. Frame 2 — the ServiceAccount: dead simple, just a named identity in the
namespace; the whole object is metadata. Frame 3 — the RoleBinding, the join: `subjects` lists WHO
(our SA), `roleRef` names WHICH Role. roleRef is immutable and its apiGroup is
rbac.authorization.k8s.io (subjects' apiGroup for a ServiceAccount is "", omitted here). Frame 4 —
all three concatenated: this is byte-for-byte what Lab 19's heredoc applies (labels app=s19 for
scoped cleanup). This final frame is the READ-ONLY baseline; the lab breaks on `delete pods`, then
edits THIS Role to add the delete verb. Hand to can-i to verify it.
-->

---
layout: code-annotated
heading: 'Verify, don''t guess: `kubectl auth can-i`'
compact: true
lab: labs/day-3/19-rbac.md
---

```bash {none|1-2|4-6|8-9|all}
# does MY current identity have a permission?
kubectl auth can-i list pods            # → yes / no, for you

# impersonate the ServiceAccount — test ITS effective permissions
kubectl auth can-i get pods \
  --as=system:serviceaccount:$NS:pod-reader-sa      # → yes
kubectl auth can-i delete pods \
  --as=system:serviceaccount:$NS:pod-reader-sa      # → no

# dump the whole effective rule set for that subject
kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa
```

::notes::

<CodeNote at="1" label="can-i — yes/no for you" variant="ok">
Answers whether the <strong>current</strong> identity may perform an action. No cluster changes,
no guessing — it evaluates the same RBAC the API server does.
</CodeNote>

<CodeNote at="2" label="--as — impersonate a subject" variant="ok">
The SA name is <code>system:serviceaccount:&lt;ns&gt;:&lt;sa&gt;</code>. <code>--as</code> asks
"what could <strong>this</strong> identity do?" — how you test a Role before a workload uses it.
</CodeNote>

<CodeNote at="3" label="--list — the full picture" variant="warn">
Dumps every effective rule for the subject. Expect a <code>pods [get list watch]</code> row —
plus baseline self-review rows every identity gets.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
<code>--as</code> itself needs the <strong>impersonate</strong> verb. On <strong>kind</strong>
you're cluster-admin, so it just works; on a shared namespace your facilitator must grant it.
</div>

<!--
Speaker: the verification tool — teach students to NEVER guess whether a Role works. `kubectl auth
can-i VERB RESOURCE` returns a plain yes/no by evaluating the exact same authorization the API
server uses, with zero side effects. The power move is `--as`: impersonate any subject and ask
what IT can do — the SA string form is system:serviceaccount:<namespace>:<name>. That's how you
validate a Role before binding it to a real workload. `--list` dumps the full effective rule set
(you'll see the pods get/list/watch row you granted, plus baseline rows like selfsubjectreviews
that every subject can do — don't be surprised by them). The one caveat: impersonation is itself a
privileged verb — the CALLER needs `impersonate`. On kind you're cluster-admin so it's free; on a
shared namespaced account it may be denied ("cannot impersonate"), and the lab's env note + the
in-pod token stretch goal cover that path. This is the exact loop of Lab 19: grant, can-i,
break, can-i, fix, can-i.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Every Pod already has an identity · you just met the subject side</span>

# ServiceAccount tokens — the identity your workloads *already* use

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="The token is projected in" kind="sa" variant="ok">
      Every Pod runs as a ServiceAccount and gets a short-lived, auto-rotated token mounted at
      <code>/var/run/secrets/kubernetes.io/serviceaccount/</code>. Code in the Pod uses it to call
      the API — that's the identity <code>can-i --as</code> was testing.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="The default SA is near-powerless" kind="api" kindVariant="labeled" variant="warn">
      Set no <code>serviceAccountName</code> and the Pod uses the namespace's <code>default</code>
      SA — which is bound to <strong>almost nothing</strong>. So a controller that needs to read
      Pods must be given its <strong>own</strong> SA + Role, exactly like the lab.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm">

<span class="kw-kicker">where this shows up next</span>

This is not academic. **Argo CD (S21)** reconciles your cluster **as a ServiceAccount**;
**operators (S22)** run their controllers **as a ServiceAccount**. Both need a precisely-scoped
Role — get it too narrow and they can't reconcile, too wide and they're the blast radius. Same
Role → SA → binding you just built.

</div>

</div>

<!--
Speaker: close the loop between the abstract subject and the running system. (1) Every Pod ALWAYS
has a ServiceAccount identity, and the kubelet projects a short-lived, audience-scoped, auto-
rotated JWT into the Pod at the well-known path. Any client library reads it automatically and
authenticates to the API as that SA — this is literally the identity we impersonated with
`can-i --as`. (Set automountServiceAccountToken: false to opt a Pod out if it never calls the
API — a small hardening win, ties back to S17.) (2) If you don't set serviceAccountName, the Pod
silently uses the namespace `default` SA, which modern clusters bind to essentially nothing — so
"my app can't list pods" is usually "it's the default SA with no Role." The fix is give it its own
SA + least-privilege Role, precisely the lab. (3) Foreshadow: S21 Argo CD and S22 operators are
both just Pods that talk to the API AS a ServiceAccount, so their whole security posture is an
RBAC Role — you now know how to read and scope it. The stretch goal in Lab 19 mounts the token and
calls the API from inside a Pod to make this concrete.
-->

---
layout: recap
heading: 'Recap — the default is deny; you grant on purpose'
story: 'A ServiceAccount starts with nothing. A read-only Role listed the allowed verbs, a RoleBinding joined the two, and can-i --as proved it: get pods yes, delete pods no. Adding one verb to the Role flipped the answer — no restart, no rebind.'
next: 'S21 · GitOps with Argo CD — a controller that reconciles your cluster as a ServiceAccount, scoped by exactly this RBAC'
---

- RBAC is **subject × verb × resource, joined by a binding** — the default is **deny**, so a
  permission exists only because a rule and a binding say so
- The **2×2**: `Role`/`RoleBinding` are **namespaced**; `ClusterRole`/`ClusterRoleBinding` are
  **cluster-wide** and the only way to name cluster-scoped resources
- A **Role grants nothing** without a **RoleBinding** — the join is the step beginners forget
- **`kubectl auth can-i … --as=…`** verifies effective permissions without guessing or applying
- Every Pod runs as a **ServiceAccount**; the `default` SA is near-powerless — give workloads
  their **own** scoped SA (**Argo CD S21**, **operators S22** do exactly this)
- Least privilege beats `cluster-admin`: a too-wide binding turns one Pod into the blast radius

<!--
Speaker: land the model that carries into S21/S22. Four beats: (1) authorization is a join —
subject × verb × resource, and it's DENY by default, purely additive, no deny rule; nothing works
until a Role AND a binding both exist. (2) The four objects are one model at two scopes — reach for
Role/RoleBinding by default, ClusterRole/ClusterRoleBinding only for cluster-scoped resources or
shared definitions. (3) can-i --as is how you verify instead of trial-and-error apply. (4) Every
workload has an SA identity; scope it tight — the default is powerless, cluster-admin is the blast
radius, the sweet spot is a purpose-built Role like the one they'll build. Hand to Lab 19: create
the SA + read-only Role + binding, prove get-pods works and delete-pods is Forbidden, then add the
delete verb and watch can-i flip. Then S21 shows Argo CD as the controller that lives or dies by
exactly this RBAC.
-->

---
layout: lab
lab: labs/day-3/19-rbac.md
duration: 25 min
env: 'namespace ✓ / kind ✓  (--as needs impersonate rights — see the lab note)'
---

## Lab 19 — Read-only identity

- Create a **ServiceAccount**, a read-only **Role** (`get`/`list`/`watch` on pods), and a
  **RoleBinding** — the slide's magic-move manifest, byte-for-byte
- Verify with `kubectl auth can-i --list --as=system:serviceaccount:$NS:pod-reader-sa`
- Run real commands **as the SA**: `get pods` succeeds; **`delete pod` is Forbidden** — the break
- **Fix:** add the `delete` verb to the Role, re-check `can-i` — now allowed
- Question: when do you need a **ClusterRole** instead? · Stretch: mount the SA token and hit the
  API from **inside** a Pod

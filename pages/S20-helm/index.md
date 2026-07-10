---
layout: section-cover
image: /covers/section-20-shipwrights-bottle.png
day: Day 3
section: '20'
tier: core
track: Delivery
---

# Helm

Install and customize apps with Helm; upgrade and roll back.

**core** · suggested Day 3 · Delivery track

<!--
Section S20 — Helm. Core, Day 3, Delivery track. Timing: ~30 min slides + 30 min lab.
Outcome: learners can package the familiar `web` app as a chart, install it as a release,
override values, upgrade to a new revision, and roll back — and can say what a revision
stores and what rollback restores. Beats: problem (copy-pasted YAML per env, hand-edited
values → drift) · mental model (chart = Chart.yaml/values.yaml/templates/; release = an
installed instance; revision = a versioned snapshot) · code-annotated (the templated `web`
Deployment) · magic-move (rendered output: defaults → --set replicaCount → --set image.tag =
the revisions) · releases & revisions (install rev1 → upgrade rev2 → rollback = a NEW rev) ·
distribution (repos AND OCI registries) · Kustomize contrast + when NOT to template · helm
template vs helm install --dry-run · debrief → S21 · lab.
Animation: NONE (per outline — the value→manifest render is a code transition, not a state
machine worth a component). The chart the slides teach IS the chart the lab installs.
ACCURACY LOCKS (verified against Helm v4.2.2 in this environment):
- Chart.yaml apiVersion: v2 (v2 = Helm 3/4; v1 was Helm 2 / Tiller). No Tiller — Helm is a
  client that renders locally and talks to the API server as you.
- A release revision stores the RENDERED manifests + the supplied values + chart metadata,
  persisted as a Secret of type helm.sh/release.v1 in the release namespace.
- `helm rollback web N` does NOT delete revisions or move a pointer back — it re-applies
  revision N's stored manifests as a NEW, higher-numbered revision.
- `helm template` renders 100% client-side (never contacts the API server). `helm install
  --dry-run=server` renders AND sends to the server for validation but doesn't persist.
- OCI (oci://…, `helm push`/`helm pull`, GA since 3.8) is referenced by URL directly — NOT
  via `helm repo add` (that's the classic index.yaml repo model).
- The taught template renders to the exact `web` Deployment/Service from S06/S07 (release
  name `web`), byte-for-byte with the lab's chart.
CKx tie-in: CKA now covers Helm & Kustomize (packaging & templating). Landed on the recap.
-->

---
layout: statement
kicker: The problem
---

You have **one** app and **three** environments — and **three** copies of the same YAML that have already drifted apart.

Dev runs 1 replica on `:1.27`, staging 2 replicas on `:1.28`, prod 4 replicas on `:1.27` with a different resource limit. Same Deployment, hand-edited per environment, kept in sync by **remembering** to edit all three. Miss one and the environments diverge silently. You don't want three files — you want **one template** and **three sets of values**.

<!--
Speaker: the templating motivation, and it's a pain every learner has felt. The `web`
Deployment from Day 1 is fine for ONE place. The moment you have dev/staging/prod (or per-
tenant, or per-region) you copy the manifest and hand-edit replicas, image tag, limits,
hostnames. Now the "source of truth" is N nearly-identical files that drift the instant
someone edits one and forgets the others. Helm's answer: keep ONE parameterised template
plus a small values file per environment. Same idea as a function with arguments instead of
N copied-and-tweaked functions. Next: what a chart actually is.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Mental model · a chart is a template, a release is an instance</span>

# Three files make a chart

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Chart.yaml — the metadata" icon="📦" variant="ok">
      Name, chart <code>version</code>, <code>appVersion</code>, and <code>apiVersion: v2</code>
      (v2 = Helm 3/4 — no Tiller). This file makes a directory a chart.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="values.yaml — the defaults" icon="🎛️" variant="ok">
      The knobs and their default settings (<code>replicaCount</code>, <code>image.tag</code>,
      …). Override any of them at install/upgrade time.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="templates/ — the manifests" icon="📄" variant="ok">
      Your Kubernetes YAML with <code>values</code> punched in as placeholders. Helm renders
      template + values → plain manifests.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="a release — chart installed" kind="deploy" variant="warn">
      <code>helm install web ./demo-app</code> renders the chart and applies it as a named
      <strong>release</strong>. Install it twice = two releases, two names.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-4 text-sm kw-muted">

**render → apply:** `template + values → manifests → the API server`. Helm is a **client** —
it renders on your machine and applies as *you*. Nothing runs server-side (no Tiller since
Helm 3).

</div>

</div>

<!--
Speaker: three files and one word. Chart.yaml (identity + versions + apiVersion v2 — flag that
v2 means Helm 3/4, v1 was the Helm-2/Tiller era that's long dead), values.yaml (the defaults,
i.e. the knobs), templates/ (your manifests with {{ .Values.x }} holes). A CHART is the
package (the template). A RELEASE is one installation of it under a name — install the same
chart twice with different names/values and you get two independent releases. Critical
correction to a common myth: Helm 3/4 has NO server component. `helm install` renders locally
and applies with your kubeconfig/RBAC — if you can't `kubectl apply` it, neither can Helm.
Next: what a template actually looks like — and it's the `web` app you already know.
-->

---
layout: code-annotated
heading: 'A template is your manifest with values punched in'
compact: true
lab: labs/day-3/20-helm.md
---

```yaml {none|4|8|20|all}
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 8080
```

::notes::

<CodeNote at="1" label=".Release.Name" variant="ok">
Built-in release data. <code>helm install <strong>web</strong> ./demo-app</code> makes every
<code>.Release.Name</code> render as <code>web</code> — so this chart produces the exact
<code>web</code> Deployment from Day 1.
</CodeNote>

<CodeNote at="2" label=".Values.replicaCount" variant="ok">
Pulled from <code>values.yaml</code> (default <code>1</code>). Override it per environment
without touching this template.
</CodeNote>

<CodeNote at="3" label=".Values.image.*" variant="ok">
Repository and tag from <code>values.yaml</code>. One knob to bump the image across every
environment that renders this chart.
</CodeNote>

<div v-click="4" class="mt-2 text-sm kw-muted">
It's still just a Deployment — Helm fills the placeholder holes from
<code>.Values</code> and <code>.Release</code>, then applies plain YAML. No magic, only
substitution.
</div>

<!--
Speaker: this is the whole trick, and it's deliberately the `web` Deployment from S06 with
holes cut in it. Two sources feed the holes: .Release.* (built-in facts about THIS
installation — Name, Namespace, …) and .Values.* (whatever values.yaml sets, overridable at
the CLI). With release name `web`, .Release.Name renders `web`, so this chart emits byte-for-
byte the Day-1 web Deployment — the point being a chart is not a new kind of object, it's your
same manifests, parameterised. Templates can also loop/conditional (Go templates + Sprig) but
save that — the mental model is "manifest with variables." Next: watch the values actually
flow into the rendered output.
-->

---
layout: code-walkthrough
heading: 'Same template, different values — that is a revision'
lab: labs/day-3/20-helm.md
---

````md magic-move
```yaml
# helm install web ./demo-app        → revision 1  (values.yaml defaults)
# replicaCount: 1  ·  image.tag: "1.27"
kind: Deployment
metadata:
  name: web
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: web
          image: "nginxinc/nginx-unprivileged:1.27"
```

```yaml
# helm upgrade web ./demo-app --set replicaCount=3     → revision 2
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3        # one value changed → the manifest re-rendered
  template:
    spec:
      containers:
        - name: web
          image: "nginxinc/nginx-unprivileged:1.27"
```

```yaml
# helm upgrade web ./demo-app --set image.tag=1.29     → revision 3
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: "nginxinc/nginx-unprivileged:1.29"    # bumped, replicas kept
```
````

<!--
Speaker: three frames = three revisions, and the diff is the story. Frame 1: install with the
defaults from values.yaml → replicas 1, tag 1.27 — that's revision 1. Frame 2: `helm upgrade
--set replicaCount=3` re-renders the SAME template with one changed value → replicas 3,
everything else identical — revision 2. Frame 3: `--set image.tag=1.29` → the image bumps,
replicas STAY 3 because upgrade carries prior values forward unless you override them (that's
the reuse-prior-values behaviour worth naming). Every install/upgrade renders fresh manifests
and stores them as a numbered revision. These are the exact bytes `helm template` prints — the
lab renders them for real. That stored history is what makes the next slide's rollback possible.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Releases & revisions · install → upgrade → roll back</span>

# Every change is a numbered, reversible revision

<div class="mt-3 text-sm" style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.8rem;">
  <v-click at="1">
    <KwCard heading="install → revision 1" kind="deploy" variant="ok">
      <code>helm install web ./demo-app</code>. Creates the release and stores revision 1.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="upgrade → revision 2, 3, …" icon="⬆️" variant="ok">
      <code>helm upgrade web ./demo-app --set …</code>. Re-renders, applies, stores a new
      revision. <code>helm history web</code> lists them all.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="rollback → yet another revision" icon="↩️" variant="warn">
      <code>helm rollback web 2</code> re-applies revision 2's manifests as a <strong>new</strong>
      revision 4. It never deletes history — it moves forward to an old state.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 text-sm">

<span class="kw-kicker">what a revision stores · what rollback restores</span>

A revision is a **snapshot**: the *rendered manifests* + the *values* + the *chart metadata*,
saved as a `Secret` (`helm.sh/release.v1`) in the release's namespace. `rollback N` re-applies
that snapshot — so it restores the **manifests and values** exactly, and it does so by creating
the *next* revision, keeping the trail intact.

</div>

</div>

<!--
Speaker: this answers the lab's required question, so land it precisely. A release has a
numbered history; install is revision 1, every upgrade adds one. Each revision is a SNAPSHOT
stored in the cluster — not "a diff", the whole rendered manifest set + the values + chart
metadata — persisted as a Secret of type helm.sh/release.v1 in the namespace (kubectl get
secret -l owner=helm shows them). Rollback is the part people get wrong: `helm rollback web 2`
does NOT delete revisions 3/4 or rewind a pointer — it reads revision 2's stored snapshot and
re-applies it AS a new, higher revision. So history only ever grows, and you can roll forward
again. What it "restores" is therefore the manifests + values of the target revision. This is
why Helm rollback is safe and auditable: nothing is destroyed, every state is replayable. The
lab breaks an upgrade and rolls back to feel this.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Distribution · where charts live</span>

# Two ways to ship a chart

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="Chart repository (index.yaml)" icon="🗂️" variant="ok">
      An HTTP server hosting packaged charts + an <code>index.yaml</code>.
      <div class="kw-muted mt-1">
        <code>helm repo add bitnami https://…</code><br>
        <code>helm install web bitnami/nginx</code>
      </div>
      The classic model — you <em>add a repo</em>, then reference <code>repo/chart</code>.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="OCI registry (the current default)" icon="🐳" variant="ok">
      Store charts as OCI artifacts in the <em>same registries as your images</em> (GHCR, ECR,
      Harbor, …).
      <div class="kw-muted mt-1">
        <code>helm push demo-app-0.1.0.tgz oci://registry/charts</code><br>
        <code>helm install web oci://registry/charts/demo-app --version 0.1.0</code>
      </div>
      No <code>repo add</code> — reference the <code>oci://</code> URL directly.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 text-sm kw-muted">

OCI support is **GA** (since Helm 3.8) and is now the recommended way to distribute charts —
one registry, one auth story for both images and charts. `helm pull` fetches a chart without
installing it.

</div>

</div>

<!--
Speaker: two distribution models, and the industry has shifted. (1) The classic chart REPO: an
HTTP server with an index.yaml catalogue; you `helm repo add name url` then install
`name/chart`. Still everywhere (Bitnami, ingress-nginx, etc.). (2) OCI registries: a chart is
just an OCI artifact, so it lives in the SAME registry as your container images — push with
`helm push chart.tgz oci://…`, install straight from the `oci://` URL with `--version`, no
`repo add` step. Keep these mentally distinct: repo = index.yaml + `repo add`; OCI = URL by
reference. OCI went GA in 3.8 and is the recommended path now — one registry and one auth for
images + charts. `helm pull` just downloads a chart (to inspect/vendor) without installing. The
lab's optional stretch pushes the demo chart to a local OCI registry.
-->

---
layout: comparison
heading: 'Template vs overlay — and when to do neither'
leftHeading: Helm
rightHeading: Kustomize
leftBadge: templates + values
rightBadge: patches + overlays
---

- **Parameterise** a manifest with `.Values.*` placeholders (the templated holes above).
- One chart, a values file per environment; also gives you **releases, revisions, rollback**.
- Ships and versions as a **package** (repo or OCI); great for redistributing apps.
- Cost: your YAML is now a **Go template** — logic and indentation bugs live in the template.

::right::

- **Patch** plain, valid YAML with overlays — no placeholders, the base stays real Kubernetes YAML.
- `kubectl apply -k` is **built in** — no extra tool, no release/rollback concept.
- Great for *your own* app across a few environments (a `base/` + `overlays/dev,prod`).
- Cost: no packaging/versioning/rollback; expressing big differences via patches gets verbose.

<div class="mt-4 text-sm" v-click>

**When NOT to template:** for one app in one place, a plain `kubectl apply -f` is fine — reach
for Helm when you **redistribute** a chart or need **release lifecycle** (revisions + rollback),
and Kustomize when you want to **overlay** your own manifests without turning them into templates.

</div>

<!--
Speaker: not Helm-vs-Kustomize as a war — they solve overlapping problems differently, and you
can even combine them. Helm TEMPLATES: placeholders + values, plus the whole release lifecycle
(install/upgrade/history/rollback) and packaging (repo/OCI). Best when you SHIP an app for
others to install, or you want versioned releases you can roll back. Kustomize OVERLAYS: no
templating language — your base is real, valid YAML and overlays patch it; it's built into
kubectl (`apply -k`), but there's no release object, no rollback, no packaging. Best for your
own manifests across a handful of environments. And the honest third option: for one app in one
namespace, don't template at all — `kubectl apply -f` is fine. Templating has a cost: your YAML
becomes a Go template and you debug indentation/logic. Match the tool to whether you're
redistributing (Helm), overlaying your own (Kustomize), or just deploying once (raw YAML).
-->

---
layout: code-annotated
heading: 'See the output before you touch the cluster'
compact: true
lab: labs/day-3/20-helm.md
---

```bash {none|1-2|4-5|all}
# render locally — NEVER contacts the cluster
helm template web ./demo-app --set replicaCount=3

# render AND send to the API server to validate — but do not install
helm install web ./demo-app --dry-run=server
```

::notes::

<CodeNote at="1" label="helm template" variant="ok">
Pure <strong>client-side</strong> render. Prints the manifests Helm <em>would</em> apply.
Works with no cluster at all — perfect for diffing and code review.
</CodeNote>

<CodeNote at="2" label="install --dry-run=server" variant="warn">
Renders <em>and</em> submits to the API server for <strong>validation/admission</strong>
(schema, PSA from S17, webhooks) — then throws it away. Nothing is stored, no release created.
</CodeNote>

<div v-click="3" class="mt-2 text-sm kw-muted">
Rule of thumb: <code>helm template</code> to <em>see the YAML</em>; <code>--dry-run=server</code>
to <em>ask the cluster if it would accept it</em>. Neither one installs.
</div>

<!--
Speaker: two "look before you leap" tools that people conflate. `helm template` is 100% local:
it renders the chart to stdout and never talks to the API server — you can run it offline, in
CI, in code review, and pipe it to `kubectl apply --dry-run=client -f -` or a differ. `helm
install --dry-run=server` renders AND sends the result to the API server so it runs real
validation and admission (schema checks, the PSA restricted gate from S17, mutating/validating
webhooks) — then discards it; no release is stored. So: template = "what would it render?",
dry-run=server = "would the cluster actually accept it?". Use template for authoring/diffing,
dry-run=server as the pre-flight before a real install. The lab uses `helm template` to inspect
the chart before installing it for real.
-->

---
layout: recap
heading: 'Debrief — one template, many values, reversible releases'
story: 'The copy-pasted-per-env YAML became one chart with a values file. Install created release revision 1; each upgrade re-rendered and stored a new revision; rollback replayed an old snapshot as a new revision — history intact.'
next: 'S21 · GitOps with Argo CD — put the desired state in Git and let the cluster reconcile toward it'
---

- A **chart** = `Chart.yaml` + `values.yaml` + `templates/`; a **release** is one installed
  instance; Helm is a **client** (renders locally, applies as you — no Tiller)
- **Values flow into templates:** `.Values.*` / `.Release.*` placeholders → rendered manifests;
  override per environment without copying YAML
- **Revisions are snapshots:** each stores rendered manifests + values + chart metadata (a
  `Secret`); **`rollback N` replays revision N as a *new* revision** — nothing is destroyed
- **Distribution:** classic **repos** (`repo add` + `index.yaml`) **and** **OCI registries**
  (`oci://` by URL, GA since 3.8, now recommended)
- **Look before you leap:** `helm template` (client render) vs `install --dry-run=server`
  (server validation); and know when to **overlay with Kustomize** or not template at all
- **CKA tie-in:** the exam now covers **Helm & Kustomize** — install/upgrade/rollback, chart
  structure, and overlays

<!--
Speaker: pull the thread together. The point was never "learn a tool" — it's "stop maintaining
N copies of a manifest." One template + per-environment values replaces the copy-paste; the
release model gives you numbered, reversible history for free. Nail the three facts that stick:
(1) chart = template, release = instance, Helm has no server; (2) a revision is a full snapshot
and rollback rolls FORWARD to an old state (new revision, history preserved); (3) two ways to
ship — repos and, now preferred, OCI. Then the judgment call: Helm to package/redistribute,
Kustomize to overlay your own YAML, plain apply for one-offs. CKA now examines Helm and
Kustomize, so this is squarely on-syllabus. Hand to Lab 20: install the demo chart, render it,
override + upgrade through revisions, break an upgrade, and roll back. Next section, S21, takes
"declare desired state" all the way — Git becomes the source of truth and Argo CD reconciles.
-->

---
layout: lab
lab: labs/day-3/20-helm.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 20 — Release lifecycle

- Install the `demo-app` chart as release `web`; `helm list` and `helm template` to inspect
- Override `replicaCount` / `image.tag` with `--set` and `-f`, then `helm upgrade`
- Read `helm history`; **break** an upgrade (bad image tag → pods never Ready), then `helm rollback`
- Answer: *what does a revision store, and what does rollback restore?*
- Stretch: package the chart and `helm push` it to a local **OCI** registry

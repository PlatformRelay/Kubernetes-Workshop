---
layout: section-cover
image: /covers/section-04-command-wand.webp
day: Day 1
section: '04'
tier: core
track: Foundations
---

# kubectl

The one tool you drive every cluster with — discover, inspect, and change.

**core** · suggested Day 1 · Foundations track

<!--
Section S04 — kubectl. Timing: ~30 min slides + 25 min lab.
Outcome: learners can drive and inspect any cluster fluently — the core verbs,
output modes (incl. jsonpath), client-vs-server dry-run, and labels/selectors as
a query language — building the "explain habit" from S03 — and know k9s as the
terminal UI over the same API (same kubeconfig, same RBAC, kubectl-first labs).
Beats: imperative one-off vs declarative apply · verb tour · output modes with a
jsonpath example (magic-move growing one command) · dry-run client vs server ·
labels & selectors · namespaces/contexts back to Lab 00 · k9s tour (what it
is/is not · drive it · views + --readonly guardrail).
k9s ACCURACY LOCKS (verified against k9scli.io + the k9s README, 2026-08):
single binary; reads the kubeconfig context; acts under YOUR RBAC (nothing
kubectl couldn't do); `:` command mode takes resource names AND aliases
(`:pods` and `:pod` both resolve); `/` filters; row hotkeys d/l/s/y/e/ctrl-d;
`:xray` dependency view; `:pulses` cluster dashboard; `--readonly` disables
all modification commands. k9s is pinned in mise.toml and documented in
docs/setup.md — the slides introduce it; no k9s lab exists by design.
CKx tie-in: CKAD/CKA — core kubectl workflow across every domain.
Lab: labs/day-1/04-kubectl.md.
-->

---
layout: comparison
heading: 'Two ways to drive — and when each fits'
leftHeading: Imperative
rightHeading: Declarative
leftBadge: 'kubectl run / create / scale'
rightBadge: 'kubectl apply -f'
---

- One-off commands that act **now**: `run`, `create`, `scale`, `delete`.
- Fast for **exploring**, demos, and generating a starting manifest.
- Nothing records *what you wanted* — only the cluster remembers.
- Repeat a change? You retype it, and hope you match last time.

::right::

- You keep the desired state in **files** and `apply` them.
- The file is the source of truth — **version it, review it, re-apply it**.
- Re-running `apply` is safe and converges to the same result (idempotent).
- This is how every real workload ships — and what everything from the Pod onward builds.

<div class="mt-4 text-sm" v-click>

Use imperative to **learn and scaffold** (`--dry-run=client -o yaml` prints the
manifest); use declarative to **run and keep** it. Today's labs generate YAML
imperatively, then `apply` it.

</div>

<!--
Speaker: don't moralise "declarative good, imperative bad" — imperative is the
fastest way to produce a first manifest. The bridge is `--dry-run=client -o yaml`,
which the output slide and the lab both lean on. Ties straight into S05's pod.yaml.
-->

---

<div class="kw-slide-dense">

<span class="kw-kicker">Eight verbs cover almost everything</span>

# The core verb tour

<div class="kw-cols-3 mt-3">
  <v-click at="1">
    <KwCard heading="Read" icon="🔍">
      <strong>get</strong> · <strong>describe</strong> · <strong>explain</strong> —
      list, deep-dive with Events, and read the schema.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Change" icon="✏️">
      <strong>apply</strong> · <strong>diff</strong> · <strong>edit</strong> —
      declare, preview, or patch live objects.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Run &amp; debug" icon="🐚" variant="plain">
      <strong>logs</strong> · <strong>exec</strong> · <strong>port-forward</strong> —
      output, shell in, and tunnel when you need them.
    </KwCard>
  </v-click>
</div>

</div>

<!--
Speaker: keep to one line per verb. The pairing to land: get→describe→logs is the
triage sequence; apply→diff is the safe-change sequence. `exec` returns in every
lab that inspects a running container.
-->

---
clicks: 3
---

<span class="kw-kicker">Story · walk the verbs in order</span>

# See the command, then the payoff

<div class="mt-2">
  <KubectlVerbDemo :step="$clicks" />
</div>

<!--
Speaker: click through the on-call chain (three clicks: describe → logs →
diff/apply). Each step shows a realistic command and the snippet of output that
actually answers the question — not a feature tour. Land the habit: get for the
headline, describe for Events, logs for app truth, diff before apply when
changing files. `clicks: 3` reserves the budget — without it `$clicks` stays 0
and the demo never leaves `get`.
-->

---
clicks: 9
---

<span class="kw-kicker">Grow one command · type, Enter, read</span>

# Output modes — get exactly what you need

<div class="mt-2">
  <KubectlOutputDemo :step="$clicks" />
</div>

<div class="mt-3 text-sm kw-muted">

`-o json` is the same as `yaml` for tools that want JSON. **`jsonpath`** turns
`kubectl` into a precise data source — the lab uses it to pull a single value.

</div>

<!--
Speaker: each mode is two clicks — (1) the command is typed, cursor blinking;
(2) Enter — sample output appears. Then the next flag. Path: table → wide →
yaml → jsonpath → one value. The jsonpath path mirrors the object tree they saw
with `explain` in S03 (`.spec.nodeName`). `-o wide` is the cheapest habit:
always more context for free. `clicks: 9` = five modes × (type + Enter) − 1.
-->

---
layout: code-annotated
heading: '`--dry-run` — render, or validate, without changing anything'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl apply -f pod.yaml --dry-run=client
kubectl apply -f pod.yaml --dry-run=server
kubectl apply -f pod.yaml
```

::notes::

<CodeNote at="1" label="--dry-run=client">
Renders and does <strong>local</strong> checks only — never contacts the API
server's admission or validation. Great for <em>generating YAML</em>
(<code>-o yaml</code>) and quick sanity checks. It can't know anything only the
<strong>server</strong> knows — like whether the target namespace even exists.
</CodeNote>

<CodeNote at="2" label="--dry-run=server" variant="ok">
Sends the object through the <strong>full server path</strong> — schema
validation, defaulting, and <strong>admission</strong> — then discards it instead
of persisting. This catches what client can't: quota, webhooks, missing
references. Same output shape, real validation.
</CodeNote>

<CodeNote at="3" label="no flag" variant="warn">
The real apply — validates <em>and</em> writes to etcd. The lab's break shows an
object that <strong>passes client but fails server</strong>, so you feel the
difference before it bites you for real.
</CodeNote>

<!--
Speaker: the one-liner — client = "does this render", server = "would the cluster
actually accept this". The lab makes it concrete: apply into a nonexistent
namespace passes client dry-run and fails server dry-run.
-->

---
layout: code-annotated
heading: 'Labels & selectors — kubectl has a query language'
lab: labs/day-1/04-kubectl.md
---

```bash {none|1|2|3}
kubectl get pods -l app=web
kubectl get pods -l 'env in (staging, prod)'
kubectl get pods -l app=web,tier=frontend
```

::notes::

<CodeNote at="1" label="equality">
<code>-l key=value</code> — the everyday filter. Selects objects carrying that
exact label. This is how a Service finds its Pods and how every lab's
cleanup scopes a delete.
</CodeNote>

<CodeNote at="2" label="set-based">
<code>in (…)</code>, <code>notin (…)</code>, and bare <code>key</code> /
<code>!key</code> for existence. More expressive when one value isn't enough.
</CodeNote>

<CodeNote at="3" label="AND-ed" variant="ok">
Comma-separate to require <strong>all</strong> of them. Labels aren't decoration —
they're the join key the whole system selects on. Set them deliberately.
</CodeNote>

<!--
Speaker: frame labels as a query language, not metadata. Foreshadow S06 (a
Deployment's selector) and S07 (a Service's selector) — both are label queries.
The recommended `app.kubernetes.io/*` labels show up in S06.
-->

---
layout: statement
kicker: 'Where am I, and the habit that saves you'
---

You are always pointed at **one context** and **one namespace** — the pair you
set back in **Lab 00**.

<div class="mt-6 text-base kw-muted">

```bash
kubectl config current-context                 # which cluster?
kubectl config view --minify | grep namespace: # which namespace?
kubectl config set-context --current --namespace=<ns>
```

</div>

<div class="mt-6" v-click>

When anything surprises you: **`kubectl explain <field>`** and
**`kubectl get … -o yaml`**. The cluster documents itself — reach for it before a
web search. That's the habit the rest of the workshop assumes.

</div>

<!--
Speaker: close the loop to Lab 00 — most "it's not working" moments are a wrong
context/namespace. Then re-plant the explain habit from S03. The lab is a
scavenger hunt that forces get/describe/explain before anyone creates a thing.
Then the k9s coda: now that they know the verbs, show the cockpit built on them.
-->

---

<span class="kw-kicker">Same API, friendlier cockpit</span>

# k9s — a terminal UI over the API you just learned

<div class="kw-cols-2 mt-3 text-sm">
  <v-click at="1">
    <KwCard heading="What it is" icon="🐶">
      A single-binary <strong>terminal UI</strong> that <strong>watches</strong> the
      cluster live — the resources, Events, and logs you've been pulling by hand,
      refreshing in place. It's already in your workshop toolchain.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="What it is not" icon="🔑" variant="plain">
      Not a side door. k9s reads your <strong>kubeconfig</strong> and talks to the
      same API server under your <strong>RBAC</strong> — it can do nothing
      <code>kubectl</code> couldn't.
    </KwCard>
  </v-click>
</div>

<div v-click="3" class="mt-4 kw-muted text-sm">

Think of it as `kubectl get … -w` for **everything at once**: navigation instead
of retyping, with describe, logs, and a shell one keystroke away.

</div>

<!--
Speaker: why introduce k9s AFTER the verb tour and not instead of it — you need the
kubectl vocabulary first, because k9s is a *view* over exactly those verbs and
resources; every panel it shows maps to a get/describe/logs you now know. It ships
in the workshop toolchain (pinned via mise, see docs/setup.md), so everyone already
has it — `k9s` in the same shell where kubectl works. Land the trust boundary hard:
it authenticates with the SAME kubeconfig context and namespace you set in Lab 00
and is subject to the same RBAC — on the shared cluster it sees your namespace,
nothing more. No agent, no server-side install. The "-w for everything" framing is
the honest pitch: k9s's core is a live watch loop over the resource views.
-->

---
layout: code-annotated
heading: 'Drive it — one `:` command and a handful of keys'
compact: true
---

```text {none|1|2|3|4}
:pods          # a live resource view (:deploy, :svc, :ns …)
/web           # filter as you type
d · l · s · y  # describe · logs · shell · YAML
ctrl-d         # delete — asks first
```

::notes::

<CodeNote at="1" label="`:` command mode">
<code>:</code> plus a resource name — <code>:pods</code>, <code>:deploy</code> —
opens that view, <strong>live</strong>.
</CodeNote>

<CodeNote at="2" label="filter, don't scroll">
<code>/</code> narrows as you type — quicker than <code>-l</code> + <code>grep</code>.
</CodeNote>

<CodeNote at="3" label="the triage keys" variant="ok">
<strong>get → describe → logs</strong> become single keys; <code>s</code> shells in.
</CodeNote>

<CodeNote at="4" label="modifying verbs confirm" variant="warn">
<code>ctrl-d</code> / <code>e</code> prompt first — same API server, same RBAC.
</CodeNote>

<!--
Speaker: do this as a 60-second live demo if the room setup allows — open k9s next
to the deck, type :pods, filter, hit d and l on a row. Narrate the mapping out
loud each time ("that's kubectl describe", "that's kubectl logs -f"). The colon
commands take the same resource names and short names kubectl uses (aliases work:
:pod and :pods both resolve), which is why we taught the verbs first. If no live
demo: the keys on the slide are the complete starter set — command mode, filter,
d/l/s/y, and the confirming delete. Everything is the same API call under the
hood, so nothing here bypasses audit logs or RBAC.
-->

---

<span class="kw-kicker">Views &amp; guardrails</span>

# X-ray vision — and a read-only safety catch

<div class="kw-cols-3 mt-4 text-sm">
  <v-click at="1">
    <KwCard heading=":xray" icon="🩻">
      A <strong>dependency tree</strong> per resource — <code>:xray deploy</code>
      walks Deployment → ReplicaSet → Pods. You'll meet that ownership chain over
      the next two sections; come back and watch it live.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading=":pulses" icon="📈" variant="plain">
      A one-screen <strong>cluster dashboard</strong> — workloads, events, and
      errors ticking in real time. The "is anything on fire" view.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="--readonly" icon="🛑" variant="ok">
      <code>k9s --readonly</code> disables <strong>every modifying command</strong> —
      the right default when you're inspecting a cluster you don't own.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-4 kw-muted text-sm">

The labs stay **`kubectl`-first** — the CLI is the language every doc, script, and
pipeline speaks. Reach for k9s when you're *watching* something unfold, and keep
translating what it shows back into the verbs.

</div>

<!--
Speaker: two power views and one guardrail. :xray shows ownership/dependency
chains — it will make much more sense after S06 (Deployment → ReplicaSet → Pod),
so plant it as "come back to this"; it's a genuine foreshadow, not a dependency.
:pulses is the at-a-glance dashboard — useful projected on a wall during the labs.
--readonly matters on the shared cluster: it turns k9s into a pure observer (also
settable per-context in its config). Close with the framing the workshop holds
throughout: kubectl is the language, k9s is a faster way to read; using k9s well
REQUIRES the kubectl mental model, which is why this is a coda and not the lead.
Optional: invite learners to keep k9s open in a second terminal during Lab 04+.
-->

---
layout: lab
lab: labs/day-1/04-kubectl.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 04 — Discovery scavenger hunt

- **Inspect only:** answer questions with `get`, `describe`, `explain` — create nothing
- **Generate YAML:** `kubectl run … --dry-run=client -o yaml` and `create deployment … --dry-run=client -o yaml`
- **Query:** pull one node's name with `-o jsonpath`; filter with `-l`
- **Break it on purpose:** an object that **passes `--dry-run=client` but fails `--dry-run=server`**
- **Nothing applied** — generated YAML is local and deletable

<script setup lang="ts">
/**
 * Click-driven kubectl output-modes demo — type a command, then "hit enter".
 * Bind `:step="$clicks"`. Odd steps reveal the sample output under the prompt.
 *
 * step 0: get pods (typed)
 * step 1: get pods → table output
 * step 2: -o wide (typed)
 * step 3: -o wide → wider table
 * step 4: -o yaml (typed)
 * step 5: -o yaml → object snippet
 * step 6: jsonpath pods (typed)
 * step 7: jsonpath → node names
 * step 8: jsonpath nodes[0] (typed)
 * step 9: jsonpath → one node name
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

const modes = [
  {
    label: 'table',
    cmd: 'kubectl get pods',
    out: `NAME          READY   STATUS    RESTARTS   AGE
web-6f8c-x2l   1/1     Running   0          2m`,
    note: 'Default: a human-readable table — eyes first.',
  },
  {
    label: '-o wide',
    cmd: 'kubectl get pods -o wide',
    out: `NAME          READY   STATUS    RESTARTS   AGE   IP           NODE
web-6f8c-x2l   1/1     Running   0          2m    10.244.1.7   worker-a`,
    note: 'Same table, free context — node and Pod IP.',
  },
  {
    label: '-o yaml',
    cmd: 'kubectl get pods -o yaml',
    out: `apiVersion: v1
kind: Pod
metadata:
  name: web-6f8c-x2l
status:
  phase: Running
# … full object as the API server stores it`,
    note: 'The whole truth — every field the server knows.',
  },
  {
    label: 'jsonpath',
    cmd: `kubectl get pods -o jsonpath='{.items[*].spec.nodeName}'`,
    out: `worker-a worker-b`,
    note: 'Extract exactly the fields you need — script-friendly.',
  },
  {
    label: 'one value',
    cmd: `kubectl get nodes -o jsonpath='{.items[0].metadata.name}'`,
    out: `worker-a`,
    note: 'One node name — no grep/awk needed.',
  },
]

const modeIdx = () => Math.min(Math.floor(props.step / 2), modes.length - 1)
const revealed = () => props.step % 2 === 1
const mode = () => modes[modeIdx()]
</script>

<template>
  <div class="kw-kod">
    <div class="kw-kod-tabs">
      <span
        v-for="(m, i) in modes"
        :key="m.label"
        class="kw-kod-tab"
        :class="{ 'is-active': modeIdx() === i, 'is-done': modeIdx() > i }"
      >
        {{ m.label }}
      </span>
    </div>

    <div class="kw-kod-term">
      <div class="kw-kod-line">
        <span class="kw-kicker">$</span>
        <code>{{ mode().cmd }}</code>
        <span v-if="!revealed()" class="kw-kod-cursor" aria-hidden="true" />
      </div>
      <Transition name="kw-kod-out">
        <pre v-if="revealed()" class="kw-kod-out">{{ mode().out }}</pre>
      </Transition>
      <p v-if="!revealed()" class="kw-kod-hint">
        Press <kbd>→</kbd> / click — as if you hit <strong>Enter</strong>
      </p>
      <p v-else class="kw-kod-note">{{ mode().note }}</p>
    </div>
  </div>
</template>

<style scoped>
.kw-kod {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.kw-kod-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.kw-kod-tab {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--kw-border);
  background: var(--kw-panel);
  color: var(--kw-text-faint);
}

.kw-kod-tab.is-done {
  color: var(--kw-ok);
  border-color: color-mix(in srgb, var(--kw-ok) 40%, var(--kw-border));
}

.kw-kod-tab.is-active {
  color: var(--kw-accent-bright);
  border-color: var(--kw-accent);
  background: color-mix(in srgb, var(--kw-accent) 12%, var(--kw-panel));
}

.kw-kod-term {
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.75rem 0.95rem;
  min-height: 11.5rem;
}

.kw-kod-line {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.kw-kod-line code {
  font-size: 0.82rem;
}

.kw-kod-cursor {
  display: inline-block;
  width: 0.55ch;
  height: 1.05em;
  margin-left: 0.1rem;
  background: var(--kw-accent-bright);
  animation: kw-kod-blink 1s step-end infinite;
  vertical-align: text-bottom;
}

@keyframes kw-kod-blink {
  50% {
    opacity: 0;
  }
}

.kw-kod-out {
  margin: 0.55rem 0 0;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border-soft);
  border-radius: var(--kw-radius-sm);
  padding: 0.45rem 0.55rem;
  white-space: pre-wrap;
}

.kw-kod-out-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.kw-kod-out-enter-from {
  opacity: 0;
  transform: translateY(-0.25rem);
}

.kw-kod-hint,
.kw-kod-note {
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  color: var(--kw-text-dim);
}

.kw-kod-hint kbd {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.72rem;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--kw-border);
  border-radius: 4px;
  background: var(--kw-bg-soft);
}
</style>

<script setup lang="ts">
/**
 * Click-driven kubectl verb tour — command + sample output pairs.
 * Bind `:step="$clicks"`. Story: on-call triage for deployment `web`.
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

const beats = [
  {
    verb: 'get',
    cmd: 'kubectl get pods -l app=web',
    out: `NAME          READY   STATUS    RESTARTS   AGE\nweb-6f8c-x2l   0/1     Pending   0          12s`,
    note: 'Surface view — is anything wrong at a glance?',
  },
  {
    verb: 'describe',
    cmd: 'kubectl describe pod web-6f8c-x2l',
    out: `Events:\n  Warning  FailedScheduling  0/3 nodes available: insufficient memory\n  Normal   Scheduled         Successfully assigned default/web-6f8c-x2l`,
    note: 'Events tell you why — status is just the headline.',
  },
  {
    verb: 'logs',
    cmd: 'kubectl logs web-6f8c-x2l -c web --previous',
    out: `Error: OOMKilled\nexit code 137`,
    note: 'App output from the last crash — pair with describe.',
  },
  {
    verb: 'apply + diff',
    cmd: 'kubectl diff -f pod.yaml && kubectl apply -f pod.yaml',
    out: `diff -u -N /tmp/LIVE-… /tmp/MERGED-…\n+  memory: 256Mi\napply: configured`,
    note: 'Preview, then declare — the safe-change sequence.',
  },
]

const beat = () => beats[Math.min(props.step, beats.length - 1)]
</script>

<template>
  <div class="kw-kvd">
    <div class="kw-kvd-story">
      <span class="kw-kicker">Story · 03:14 on-call</span>
      <p>
        Deployment <code>web</code> is flapping. You don't guess — you walk the verb chain:
        <strong>get → describe → logs</strong>, then <strong>diff → apply</strong> to fix it.
      </p>
    </div>

    <div class="kw-kvd-steps">
      <button
        v-for="(b, i) in beats"
        :key="b.verb"
        type="button"
        class="kw-kvd-tab"
        :class="{ 'is-active': step === i, 'is-done': step > i }"
        disabled
      >
        {{ b.verb }}
      </button>
    </div>

    <div class="kw-kvd-panel">
      <div class="kw-kvd-cmd">
        <span class="kw-kicker">$</span>
        <code>{{ beat().cmd }}</code>
      </div>
      <pre class="kw-kvd-out">{{ beat().out }}</pre>
      <p class="kw-kvd-note">{{ beat().note }}</p>
    </div>
  </div>
</template>

<style scoped>
.kw-kvd {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.kw-kvd-story {
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border-soft);
  border-left: 3px solid var(--kw-accent);
  border-radius: 0 var(--kw-radius-sm) var(--kw-radius-sm) 0;
  padding: 0.45rem 0.75rem;
}

.kw-kvd-story p {
  margin: 0.25rem 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--kw-text-dim);
}

.kw-kvd-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.kw-kvd-tab {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--kw-border);
  background: var(--kw-panel);
  color: var(--kw-text-faint);
  cursor: default;
}

.kw-kvd-tab.is-done {
  color: var(--kw-ok);
  border-color: color-mix(in srgb, var(--kw-ok) 40%, var(--kw-border));
}

.kw-kvd-tab.is-active {
  color: var(--kw-accent-bright);
  border-color: var(--kw-accent);
  background: color-mix(in srgb, var(--kw-accent) 12%, var(--kw-panel));
}

.kw-kvd-panel {
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.65rem 0.85rem;
}

.kw-kvd-cmd {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.kw-kvd-cmd code {
  font-size: 0.82rem;
}

.kw-kvd-out {
  margin: 0;
  font-size: 0.72rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border-soft);
  border-radius: var(--kw-radius-sm);
  padding: 0.45rem 0.55rem;
  white-space: pre-wrap;
}

.kw-kvd-note {
  margin: 0.45rem 0 0;
  font-size: 0.78rem;
  color: var(--kw-text-dim);
}
</style>

<script setup lang="ts">
/**
 * Click-driven Pod lifecycle — phases, container restarts vs Pod deletion.
 * Bind `:step="$clicks"`. Story: Mina applies `web`, watches it come up, sees a
 * crash restart in place, then deletes the Pod and nothing brings it back.
 *
 * step 0: Pending — scheduled, image pulling
 * step 1: Running — Ready, serving traffic
 * step 2: CrashLoopBackOff beat — container restarted in place (RESTARTS ↑)
 * step 3: Deleted — object gone; underline the Deployment gap
 */
const props = withDefaults(
  defineProps<{
    step?: number
    podName?: string
  }>(),
  {
    step: 0,
    podName: 'web',
  },
)

const phase = () => {
  if (props.step >= 3) return 'Deleted'
  if (props.step >= 2) return 'Running'
  if (props.step >= 1) return 'Running'
  return 'Pending'
}

const ready = () => props.step >= 1 && props.step < 3
const restarts = () => (props.step >= 2 && props.step < 3 ? 1 : 0)
const deleted = () => props.step >= 3
</script>

<template>
  <div class="kw-plc">
    <div class="kw-plc-timeline">
      <div
        v-for="(node, i) in [
          { key: 'pending', label: 'Pending', hint: 'scheduler + image pull' },
          { key: 'running', label: 'Running', hint: 'containers up' },
          { key: 'restart', label: 'Running', hint: 'container restarted in place' },
          { key: 'deleted', label: 'Deleted', hint: 'object removed' },
        ]"
        :key="node.key"
        class="kw-plc-node"
        :class="{
          'is-active': props.step === i,
          'is-done': props.step > i,
          'is-danger': node.key === 'deleted' && props.step >= 3,
        }"
      >
        <div class="kw-plc-node-dot" />
        <div class="kw-plc-node-label">{{ node.label }}</div>
        <div class="kw-plc-node-hint">{{ node.hint }}</div>
      </div>
    </div>

    <div class="kw-plc-detail" :class="{ 'is-deleted': deleted() }">
      <div class="kw-plc-detail-head">
        <K8sIcon kind="pod" variant="unlabeled" size="1.6rem" />
        <code>{{ props.podName }}</code>
        <span class="kw-plc-phase" :class="`is-${phase().toLowerCase()}`">{{ phase() }}</span>
      </div>

      <div v-if="!deleted()" class="kw-plc-detail-grid">
        <div class="kw-plc-stat">
          <span class="kw-plc-stat-k">READY</span>
          <span class="kw-plc-stat-v">{{ ready() ? '1/1' : '0/1' }}</span>
        </div>
        <div class="kw-plc-stat">
          <span class="kw-plc-stat-k">RESTARTS</span>
          <span class="kw-plc-stat-v" :class="{ 'is-warn': restarts() > 0 }">{{ restarts() }}</span>
        </div>
        <div class="kw-plc-stat">
          <span class="kw-plc-stat-k">restartPolicy</span>
          <span class="kw-plc-stat-v">Always</span>
        </div>
      </div>

      <p class="kw-plc-caption">
        <template v-if="props.step <= 0">
          Mina runs <code>kubectl apply -f pod.yaml</code>. The Pod is accepted, but
          <strong>phase stays Pending</strong> until a node is chosen and the image is pulled.
        </template>
        <template v-else-if="props.step === 1">
          Image pulled, container started — <strong>Running</strong>, <code>READY 1/1</code>.
          Phase is a headline; <code>describe</code> and Events hold the detail.
        </template>
        <template v-else-if="props.step === 2">
          PID 1 exits non-zero. <strong>Same Pod</strong>, container restarted —
          <code>RESTARTS</code> climbs, phase stays <strong>Running</strong>.
          <code>restartPolicy</code> never recreates the Pod object.
        </template>
        <template v-else>
          <code>kubectl delete pod web</code> — the object is gone. Nothing in the cluster
          recreates it. That gap is exactly why a <strong>Deployment</strong> exists (S06).
        </template>
      </p>
    </div>
  </div>
</template>

<style scoped>
.kw-plc {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.kw-plc-timeline {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.45rem;
}

.kw-plc-node {
  text-align: center;
  padding: 0.45rem 0.35rem 0.35rem;
  border-radius: var(--kw-radius-sm);
  border: 1px solid var(--kw-border-soft);
  background: var(--kw-bg-soft);
  opacity: 0.45;
  transition: opacity 0.2s, border-color 0.2s, background 0.2s;
}

.kw-plc-node.is-active,
.kw-plc-node.is-done {
  opacity: 1;
}

.kw-plc-node.is-active {
  border-color: var(--kw-accent);
  background: color-mix(in srgb, var(--kw-accent) 10%, var(--kw-panel));
}

.kw-plc-node.is-danger.is-active {
  border-color: var(--kw-danger);
  background: color-mix(in srgb, var(--kw-danger) 10%, var(--kw-panel));
}

.kw-plc-node-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
  margin: 0 auto 0.35rem;
  background: var(--kw-text-faint);
}

.kw-plc-node.is-active .kw-plc-node-dot {
  background: var(--kw-accent-bright);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--kw-accent) 30%, transparent);
}

.kw-plc-node.is-danger.is-active .kw-plc-node-dot {
  background: var(--kw-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--kw-danger) 30%, transparent);
}

.kw-plc-node-label {
  font-weight: 650;
  font-size: 0.82rem;
}

.kw-plc-node-hint {
  font-size: 0.68rem;
  color: var(--kw-text-faint);
  margin-top: 0.15rem;
  line-height: 1.3;
}

.kw-plc-detail {
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.75rem 0.95rem;
}

.kw-plc-detail.is-deleted {
  border-color: color-mix(in srgb, var(--kw-danger) 45%, var(--kw-border));
}

.kw-plc-detail-head {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-bottom: 0.55rem;
}

.kw-plc-phase {
  margin-left: auto;
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: var(--kw-panel-2);
  border: 1px solid var(--kw-border);
}

.kw-plc-phase.is-pending {
  color: var(--kw-warn);
  border-color: color-mix(in srgb, var(--kw-warn) 40%, var(--kw-border));
}

.kw-plc-phase.is-running {
  color: var(--kw-ok);
  border-color: color-mix(in srgb, var(--kw-ok) 40%, var(--kw-border));
}

.kw-plc-phase.is-deleted {
  color: var(--kw-danger);
  border-color: color-mix(in srgb, var(--kw-danger) 40%, var(--kw-border));
}

.kw-plc-detail-grid {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.55rem;
}

.kw-plc-stat-k {
  display: block;
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--kw-text-faint);
}

.kw-plc-stat-v {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.88rem;
  font-weight: 600;
}

.kw-plc-stat-v.is-warn {
  color: var(--kw-warn);
}

.kw-plc-caption {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
}

.kw-plc-caption :deep(strong) {
  color: var(--kw-text);
}
</style>

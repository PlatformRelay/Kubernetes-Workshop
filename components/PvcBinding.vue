<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven PVC binding + data-survival animation (S11 storage).
 * Bind `:step="$clicks"` so it advances alongside the storage magic-move.
 *
 * Three persistent lanes — the Pod is ephemeral, the PVC (the request) and the
 * PV (the storage) outlive it, and the PV keeps the written data across a Pod
 * delete. Modelled on dynamic provisioning with a WaitForFirstConsumer
 * StorageClass (kind's local-path default): the PVC stays Pending until a Pod
 * consumes it, which is exactly what the lab observes.
 *
 * Self-contained (no PodCard import, K8sIcon read-only) and every fixed `step`
 * renders a meaningful static state, so PDF/static export is faithful (ADR 0001).
 *
 * step 0: PVC created → Pending (no consumer yet), no PV, no data
 * step 1: Pod schedules → provisioner mints the PV → PVC Bound → data written
 * step 2: Pod deleted (Terminating) → PVC + PV + data persist
 * step 3: Pod recreated → re-binds the SAME PVC/PV → the sentinel survived
 */
const props = withDefaults(defineProps<{ step?: number }>(), { step: 0 })

const podPhase = computed(() => {
  switch (props.step) {
    case 0:
      return { label: 'no Pod yet', tone: 'idle' as const }
    case 2:
      return { label: 'Terminating', tone: 'danger' as const }
    default:
      return { label: 'Running', tone: 'ok' as const }
  }
})

// PVC binds once a consumer (the Pod) exists — step 1 onward.
const bound = computed(() => props.step >= 1)
// The PV exists (was provisioned) from step 1 and never goes away in this demo.
const pvExists = computed(() => props.step >= 1)
// The sentinel file is written at step 1 and persists across the Pod delete.
const hasData = computed(() => props.step >= 1)
</script>

<template>
  <div class="kw-pvc">
    <div class="kw-pvc-lanes">
      <!-- Pod: the ephemeral consumer -->
      <div class="kw-pvc-lane" :class="`is-${podPhase.tone}`">
        <div class="kw-kicker">Pod · <code>web</code></div>
        <div class="kw-pvc-card" :class="{ 'is-ghost': props.step === 0 }">
          <K8sIcon kind="pod" variant="unlabeled" size="2.4rem" />
          <div class="kw-pvc-phase" :class="`is-${podPhase.tone}`">{{ podPhase.label }}</div>
        </div>
      </div>

      <div class="kw-pvc-link" :class="{ 'is-live': bound }">claim →</div>

      <!-- PVC: the request, persists -->
      <div class="kw-pvc-lane">
        <div class="kw-kicker">PersistentVolumeClaim</div>
        <div class="kw-pvc-card">
          <K8sIcon kind="pvc" variant="unlabeled" size="2.4rem" />
          <div class="kw-pvc-phase" :class="bound ? 'is-ok' : 'is-warn'">
            {{ bound ? 'Bound' : 'Pending' }}
          </div>
        </div>
      </div>

      <div class="kw-pvc-link" :class="{ 'is-live': pvExists }">binds →</div>

      <!-- PV: the storage, persists and holds the data -->
      <div class="kw-pvc-lane">
        <div class="kw-kicker">PersistentVolume</div>
        <div class="kw-pvc-card" :class="{ 'is-ghost': !pvExists }">
          <K8sIcon kind="pv" variant="unlabeled" size="2.4rem" />
          <div v-if="pvExists" class="kw-pvc-data" :class="{ 'is-kept': hasData }">
            <span class="kw-pvc-dot" /> data.txt
          </div>
          <div v-else class="kw-pvc-phase is-idle">not provisioned</div>
        </div>
      </div>
    </div>

    <div class="kw-pvc-caption">
      <template v-if="props.step <= 0">
        The PVC is a <strong>request</strong>. With a <code>WaitForFirstConsumer</code>
        StorageClass it stays <strong>Pending</strong> until a Pod actually mounts it — no
        Pod, no PV yet.
      </template>
      <template v-else-if="props.step === 1">
        The Pod schedules, the provisioner mints a <strong>PV</strong>, the PVC goes
        <strong>Bound</strong>, and the container writes <code>data.txt</code>.
      </template>
      <template v-else-if="props.step === 2">
        Delete the Pod — the PVC and PV are <strong>separate objects</strong>, so they (and
        the data) stay put.
      </template>
      <template v-else>
        The Deployment recreates the Pod; it re-binds the <strong>same</strong> PVC/PV and
        <strong><code>data.txt</code> survived</strong>. That is durable storage.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-pvc {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-pvc-lanes {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
}

.kw-pvc-lane {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: center;
}

.kw-pvc-card {
  width: 9.5rem;
  min-height: 6.2rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  transition: all 0.45s ease;
}

.kw-pvc-card.is-ghost {
  opacity: 0.35;
  border-style: dashed;
}

.kw-pvc-lane.is-ok .kw-pvc-card {
  border-color: var(--kw-ok);
}

.kw-pvc-lane.is-danger .kw-pvc-card {
  border-color: var(--kw-danger);
}

.kw-pvc-phase {
  font-size: 0.74rem;
  font-weight: 600;
}

.kw-pvc-phase.is-ok {
  color: var(--kw-ok);
}

.kw-pvc-phase.is-warn {
  color: var(--kw-warn);
}

.kw-pvc-phase.is-danger {
  color: var(--kw-danger);
}

.kw-pvc-phase.is-idle {
  color: var(--kw-text-faint);
}

.kw-pvc-data {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--kw-ok);
}

.kw-pvc-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: var(--kw-ok);
}

.kw-pvc-link {
  font-size: 0.74rem;
  color: var(--kw-text-faint);
  white-space: nowrap;
  transition: color 0.45s ease;
}

.kw-pvc-link.is-live {
  color: var(--kw-text-dim);
}

.kw-pvc-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
  text-align: center;
  max-width: 44rem;
  margin: 0 auto;
}
</style>

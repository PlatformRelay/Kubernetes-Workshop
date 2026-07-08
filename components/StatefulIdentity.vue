<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven StatefulSet identity + per-Pod storage animation (S12).
 * Bind `:step="$clicks"` so it advances alongside the section walkthrough.
 *
 * A StatefulSet differs from a Deployment in two visible ways this animation
 * makes concrete: Pods are created (and deleted) in a STABLE ORDER with STABLE
 * NAMES (web-0, web-1, web-2), and each ordinal owns its OWN PVC minted from
 * volumeClaimTemplates. The payoff frame: delete web-1 and it comes back with
 * the SAME name re-bound to the SAME PVC (data intact) — where a Deployment Pod
 * would return with a random name and no memory.
 *
 * Self-contained (K8sIcon is read-only) and every fixed `step` renders a
 * meaningful static state, so PDF/static export is faithful (ADR 0001). Kept to
 * a handful of discrete states rather than animating every Pod × PVC pair.
 *
 * step 0: nothing yet — the headless Service exists, no Pods
 * step 1: web-0 created + pvc data-web-0 bound (ordinal 0 only)
 * step 2: web-1, then web-2 created IN ORDER, each with its own PVC
 * step 3: sentinel written into web-1's volume
 * step 4: web-1 deleted (Terminating) — its PVC persists (separate lifecycle)
 * step 5: web-1 recreated — SAME name, re-binds the SAME PVC, sentinel survived
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

type PodState = 'absent' | 'running' | 'terminating' | 'restored'

interface Ordinal {
  ordinal: number
  name: string
  pvc: string
}

const ORDINALS: Ordinal[] = [
  { ordinal: 0, name: 'web-0', pvc: 'data-web-0' },
  { ordinal: 1, name: 'web-1', pvc: 'data-web-1' },
  { ordinal: 2, name: 'web-2', pvc: 'data-web-2' },
]

// How many ordinals exist yet: web-0 at step 1, all three from step 2 on.
const created = computed(() => {
  if (props.step <= 0) return 0
  if (props.step === 1) return 1
  return 3
})

// web-1 is the ordinal we exercise (sentinel → delete → restore).
function podState(ordinal: number): PodState {
  if (ordinal >= created.value) return 'absent'
  if (ordinal === 1) {
    if (props.step === 4) return 'terminating'
    if (props.step === 5) return 'restored'
  }
  return 'running'
}

// The PVC for an ordinal appears with the Pod and never disappears once minted
// (it outlives the web-1 delete — the whole point).
function pvcExists(ordinal: number): boolean {
  return ordinal < created.value
}

// web-1's volume holds the sentinel from step 3 onward — across the delete.
function hasData(ordinal: number): boolean {
  return ordinal === 1 && props.step >= 3
}

const phaseLabel: Record<PodState, string> = {
  absent: 'not created',
  running: 'Running',
  terminating: 'Terminating',
  restored: 'Running (recreated)',
}

const phaseTone: Record<PodState, string> = {
  absent: 'idle',
  running: 'ok',
  terminating: 'danger',
  restored: 'ok',
}
</script>

<template>
  <div class="kw-sts">
    <div class="kw-sts-headless">
      <K8sIcon kind="svc" variant="unlabeled" size="1.6rem" />
      <span>headless Service <code>web</code> · <code>clusterIP: None</code></span>
    </div>

    <div class="kw-sts-lanes">
      <div
        v-for="o in ORDINALS"
        :key="o.ordinal"
        class="kw-sts-col"
      >
        <!-- Pod (the ordinal) -->
        <div class="kw-sts-card" :class="[`is-${phaseTone[podState(o.ordinal)]}`, { 'is-ghost': podState(o.ordinal) === 'absent' }]">
          <K8sIcon kind="pod" variant="unlabeled" size="1.9rem" />
          <div class="kw-sts-name">{{ o.name }}</div>
          <div class="kw-sts-phase" :class="`is-${phaseTone[podState(o.ordinal)]}`">
            {{ phaseLabel[podState(o.ordinal)] }}
          </div>
        </div>

        <div class="kw-sts-link" :class="{ 'is-live': pvcExists(o.ordinal) }">mounts ↓</div>

        <!-- Per-Pod PVC from volumeClaimTemplates -->
        <div class="kw-sts-card kw-sts-pvc" :class="{ 'is-ghost': !pvcExists(o.ordinal) }">
          <K8sIcon kind="pvc" variant="unlabeled" size="1.7rem" />
          <div class="kw-sts-name">{{ o.pvc }}</div>
          <div v-if="hasData(o.ordinal)" class="kw-sts-data">
            <span class="kw-sts-dot" /> data.txt
          </div>
        </div>
      </div>
    </div>

    <div v-if="props.showCaption" class="kw-sts-caption">
      <template v-if="props.step <= 0">
        The <strong>headless Service</strong> gives each Pod a stable DNS name. No Pods yet —
        the StatefulSet is about to create them <strong>in order</strong>.
      </template>
      <template v-else-if="props.step === 1">
        <code>web-0</code> is created <strong>first</strong> and its own PVC
        <code>data-web-0</code> is minted from <code>volumeClaimTemplates</code>.
      </template>
      <template v-else-if="props.step === 2">
        Then <code>web-1</code>, then <code>web-2</code> — <strong>strictly ordered</strong>,
        each with its <strong>own</strong> PVC. Ordinal names are stable, not random.
      </template>
      <template v-else-if="props.step === 3">
        Write a sentinel into <code>web-1</code>'s volume — it lands on
        <code>data-web-1</code>, not on the Pod.
      </template>
      <template v-else-if="props.step === 4">
        Delete <code>web-1</code>. Its PVC <code>data-web-1</code> is a
        <strong>separate object</strong> and stays put — data and all.
      </template>
      <template v-else>
        <code>web-1</code> returns with the <strong>same name</strong>, re-binds the
        <strong>same PVC</strong>, and the sentinel survived. A Deployment Pod would come back
        <strong>random and empty</strong>.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-sts {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: center;
}

.kw-sts-headless {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  color: var(--kw-text-dim);
}

.kw-sts-lanes {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 1.4rem;
}

.kw-sts-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
}

.kw-sts-card {
  width: 9rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  transition: all 0.45s ease;
}

.kw-sts-pvc {
  padding: 0.4rem 0.6rem;
}

.kw-sts-card.is-ghost {
  opacity: 0.3;
  border-style: dashed;
}

.kw-sts-card.is-ok {
  border-color: var(--kw-ok);
}

.kw-sts-card.is-danger {
  border-color: var(--kw-danger);
}

.kw-sts-name {
  font-size: 0.76rem;
  font-weight: 600;
  font-family: var(--kw-font-mono, monospace);
  color: var(--kw-text);
}

.kw-sts-phase {
  font-size: 0.68rem;
  font-weight: 600;
}

.kw-sts-phase.is-ok {
  color: var(--kw-ok);
}

.kw-sts-phase.is-danger {
  color: var(--kw-danger);
}

.kw-sts-phase.is-idle {
  color: var(--kw-text-faint);
}

.kw-sts-link {
  font-size: 0.7rem;
  color: var(--kw-text-faint);
  transition: color 0.45s ease;
}

.kw-sts-link.is-live {
  color: var(--kw-text-dim);
}

.kw-sts-data {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--kw-ok);
}

.kw-sts-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--kw-ok);
}

.kw-sts-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.6rem;
  text-align: center;
  max-width: 46rem;
  margin: 0 auto;
}
</style>

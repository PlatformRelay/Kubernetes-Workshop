<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven Horizontal Pod Autoscaler animation (S16).
 * Bind `:step="$clicks"` so it advances alongside the scale-behaviour beat.
 *
 * The HPA control loop made physical: a CPU gauge drives the size of the herd.
 * Every ~15s the controller reads average CPU utilization (as a % of the Pods'
 * `requests.cpu`), compares it to the target, and computes
 *   desiredReplicas = ceil(currentReplicas × currentUtil / targetUtil)
 * clamped to [minReplicas, maxReplicas]. Load up → herd grows; load gone → the
 * herd HOLDS for the scale-down stabilization window (default 300s) before
 * shrinking, so a brief dip doesn't thrash the replica count.
 *
 * Self-contained (no PodCard — the herd is many small glyphs; K8sIcon is
 * read-only) and every fixed `step` renders a meaningful static state, so
 * PDF/static export is faithful (ADR 0001).
 *
 * min 2 · max 10 · target 50% (matches the S16 lab HPA).
 * step 0: steady — 2 Pods (min), 15% util, well under target
 * step 1: load spikes — util 90%, HPA computes desired = ceil(2×90/50) = 4
 * step 2: scaled up to 4 — load spreads, util eases toward the 50% target
 * step 3: settled — util at the 50% target, replicas stable at 4
 * step 4: load gone — util 15%, but replicas HOLD (scaleDown stabilization 300s)
 * step 5: window elapsed — scaled back down to 2 (min)
 *
 * `showCaption` (default true) toggles the in-component narration — set it false
 * when a companion `v-clicks` legend already narrates the steps.
 */
const props = withDefaults(defineProps<{ step?: number; showCaption?: boolean }>(), {
  step: 0,
  showCaption: true,
})

const MIN = 2
const MAX = 10
const TARGET = 50

// per-step (utilization %, live replica count) — the herd size trails the gauge
// by one step, which is the whole point (the controller reacts, then acts).
const frame = computed(() => {
  switch (props.step) {
    case 0:
      return { util: 15, replicas: 2, holding: false, loaded: false }
    case 1:
      return { util: 90, replicas: 2, holding: false, loaded: true }
    case 2:
      return { util: 55, replicas: 4, holding: false, loaded: true }
    case 3:
      return { util: 50, replicas: 4, holding: false, loaded: true }
    case 4:
      return { util: 15, replicas: 4, holding: true, loaded: false }
    default:
      return { util: 15, replicas: 2, holding: false, loaded: false }
  }
})

// desiredReplicas = ceil(current × util / target), clamped to [MIN, MAX].
const desired = computed(() => {
  const raw = Math.ceil((frame.value.replicas * frame.value.util) / TARGET)
  return Math.min(MAX, Math.max(MIN, raw))
})

const over = computed(() => frame.value.util > TARGET)

const pods = computed(() =>
  Array.from({ length: frame.value.replicas }, (_, i) => ({ id: `pod-${i}` })),
)
</script>

<template>
  <div class="kw-hpa">
    <!-- CPU gauge with the target marker -->
    <div class="kw-hpa-gauge-row">
      <span class="kw-hpa-gauge-label">avg&nbsp;CPU</span>
      <div class="kw-hpa-gauge">
        <div
          class="kw-hpa-fill"
          :class="{ 'is-over': over, 'is-under': !over }"
          :style="{ width: Math.min(100, frame.util) + '%' }"
        />
        <div class="kw-hpa-target" :style="{ left: TARGET + '%' }">
          <span class="kw-hpa-target-tag">target {{ TARGET }}%</span>
        </div>
      </div>
      <span class="kw-hpa-util" :class="{ 'is-over': over, 'is-under': !over }">
        {{ frame.util }}%
      </span>
    </div>

    <!-- HPA decision chip -->
    <div class="kw-hpa-calc">
      <code>ceil({{ frame.replicas }} × {{ frame.util }}% / {{ TARGET }}%)</code>
      <span class="kw-hpa-arrow">→</span>
      <span
        class="kw-hpa-desired"
        :class="{ 'is-grow': desired > frame.replicas, 'is-hold': frame.holding }"
      >
        desired&nbsp;<strong>{{ frame.holding ? MIN : desired }}</strong>
      </span>
      <span v-if="frame.holding" class="kw-hpa-hold-tag">holding · scaleDown 300s</span>
    </div>

    <!-- the herd -->
    <div class="kw-hpa-herd">
      <TransitionGroup name="kw-hpa-pods" tag="div" class="kw-hpa-pods">
        <div v-for="pod in pods" :key="pod.id" class="kw-hpa-pod">
          <K8sIcon kind="pod" variant="unlabeled" size="1.6rem" alt="" />
        </div>
      </TransitionGroup>
      <div class="kw-hpa-count">
        <span class="kw-hpa-chip">REPLICAS&nbsp;<strong>{{ frame.replicas }}</strong></span>
        <span class="kw-hpa-chip kw-hpa-chip-muted">min {{ MIN }} · max {{ MAX }}</span>
      </div>
    </div>

    <div v-if="props.showCaption" class="kw-hpa-caption">
      <template v-if="props.step <= 0">
        Steady state — <strong>2</strong> Pods (min), CPU well under the target. Nothing to do.
      </template>
      <template v-else-if="props.step === 1">
        Load spikes to <strong>90%</strong>. The HPA reads it and computes a new desired count —
        <strong>4</strong> Pods.
      </template>
      <template v-else-if="props.step === 2">
        Scaled up to <strong>4</strong>. The same load now spreads across more Pods, so per-Pod
        CPU falls back toward the target.
      </template>
      <template v-else-if="props.step === 3">
        Settled — utilization sits at the <strong>50% target</strong>, so desired == current and
        the herd holds at 4.
      </template>
      <template v-else>
        Load gone, CPU back to 15% — but replicas <strong>hold at 4</strong> for the
        <strong>scaleDown stabilization window (300s)</strong> before shrinking to min. That
        delay is deliberate: it stops a brief lull from thrashing the count.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-hpa {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.kw-hpa-gauge-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}

.kw-hpa-gauge-label {
  font-size: 0.78rem;
  color: var(--kw-text-dim);
  white-space: nowrap;
}

.kw-hpa-gauge {
  position: relative;
  flex: 1;
  height: 1.4rem;
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  overflow: visible;
}

.kw-hpa-fill {
  height: 100%;
  border-radius: var(--kw-radius-sm);
  transition: width 0.6s ease, background 0.4s ease;
}

.kw-hpa-fill.is-under {
  background: color-mix(in srgb, var(--kw-ok) 55%, transparent);
}

.kw-hpa-fill.is-over {
  background: color-mix(in srgb, var(--kw-warn) 65%, transparent);
}

.kw-hpa-target {
  position: absolute;
  top: -0.2rem;
  bottom: -0.2rem;
  width: 0;
  border-left: 2px dashed var(--kw-accent);
}

.kw-hpa-target-tag {
  position: absolute;
  top: -1.15rem;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.62rem;
  color: var(--kw-accent);
  white-space: nowrap;
}

.kw-hpa-util {
  font-size: 0.9rem;
  font-weight: 700;
  min-width: 3rem;
  text-align: right;
}

.kw-hpa-util.is-under {
  color: var(--kw-ok);
}

.kw-hpa-util.is-over {
  color: var(--kw-warn);
}

.kw-hpa-calc {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--kw-text-dim);
}

.kw-hpa-calc code {
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.15rem 0.5rem;
}

.kw-hpa-arrow {
  color: var(--kw-text-faint);
}

.kw-hpa-desired {
  color: var(--kw-text-dim);
  transition: color 0.4s ease;
}

.kw-hpa-desired.is-grow {
  color: var(--kw-warn);
}

.kw-hpa-desired.is-hold {
  color: var(--kw-accent);
}

.kw-hpa-hold-tag {
  font-size: 0.72rem;
  color: var(--kw-accent);
  border: 1px dashed var(--kw-accent);
  border-radius: var(--kw-radius-sm);
  padding: 0.1rem 0.45rem;
}

.kw-hpa-herd {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.kw-hpa-pods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  min-height: 4.4rem;
  align-content: flex-start;
}

.kw-hpa-pod {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  background: var(--kw-panel);
  border: 1.5px solid color-mix(in srgb, var(--kw-ok) 60%, transparent);
  border-radius: var(--kw-radius-sm);
}

.kw-hpa-count {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.kw-hpa-chip {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.25rem 0.7rem;
}

.kw-hpa-chip-muted {
  color: var(--kw-text-faint);
}

.kw-hpa-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 3rem;
}

.kw-hpa-pods-enter-active,
.kw-hpa-pods-leave-active,
.kw-hpa-pods-move {
  transition: all 0.5s ease;
}

.kw-hpa-pods-enter-from {
  opacity: 0;
  transform: scale(0.6);
}

.kw-hpa-pods-leave-to {
  opacity: 0;
  transform: scale(0.6);
}

.kw-hpa-pods-leave-active {
  position: absolute;
}
</style>

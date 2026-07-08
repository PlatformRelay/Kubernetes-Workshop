<script setup lang="ts">
import { computed } from 'vue'
import type { PodState } from './usePodReplace'
import { NEW_TAG, OLD_TAG } from './usePodReplace'

/**
 * Click-driven rolling update — the shared US-X2 animation.
 * Bind `:step="$clicks"` so it advances alongside the S06 magic-move that bumps
 * the Deployment image. Two ReplicaSets: the old one scales DOWN as the new one
 * scales UP, one step at a time, so the app never drops below `desired` ready.
 *
 * Reuses the PodCard vocabulary and the kw-* variables (ADR 0001). Every fixed
 * `step` renders a meaningful static state, so PDF/static export is faithful.
 * Parameterized (desired / oldTag / newTag) for reuse.
 *
 * step 0: old RS = 3 Running · new RS = 0         (steady state, v1.27)
 * step 1: new RS surges +1 (maxSurge)             (old 3, new 1 creating → 4 total)
 * step 2: new Pod Ready → one old Pod terminates  (old 2, new 3 → converging)
 * step 3: migration complete                      (old RS drained to 0, kept for rollback)
 */
const props = withDefaults(
  defineProps<{
    step?: number
    desired?: number
    oldTag?: string
    newTag?: string
  }>(),
  { step: 0, desired: 3, oldTag: OLD_TAG, newTag: NEW_TAG },
)

// old/new ReplicaSet Pod counts per step — the surge (+1) is visible at step 1,
// then old drains while new fills, ending old 0 / new = desired.
const counts = computed(() => {
  switch (props.step) {
    case 0:
      return { old: props.desired, newCreating: 0, newReady: 0 }
    case 1:
      return { old: props.desired, newCreating: 1, newReady: 0 }
    case 2:
      return { old: props.desired - 1, newCreating: 0, newReady: 1 }
    default:
      return { old: 0, newCreating: 0, newReady: props.desired }
  }
})

const oldPods = computed<PodState[]>(() =>
  Array.from({ length: counts.value.old }, (_, i) => ({
    id: `old-${i}`,
    name: `web-6f8c-${['x2lqp', '7nqld', 'lm4tt'][i] ?? i}`,
    image: props.oldTag,
    phase: props.step >= 3 ? 'Terminating' : 'Running',
  })),
)

const newPods = computed<PodState[]>(() => {
  const ready: PodState[] = Array.from({ length: counts.value.newReady }, (_, i) => ({
    id: `new-r-${i}`,
    name: `web-7d4b-${['m8trz', 'k4p2v', 'q9wsd'][i] ?? i}`,
    image: props.newTag,
    phase: 'Running',
  }))
  const creating: PodState[] = Array.from({ length: counts.value.newCreating }, (_, i) => ({
    id: `new-c-${i}`,
    name: `web-7d4b-${['m8trz', 'k4p2v', 'q9wsd'][counts.value.newReady + i] ?? i}`,
    image: props.newTag,
    phase: 'ContainerCreating',
  }))
  return [...ready, ...creating]
})

const total = computed(() => oldPods.value.length + newPods.value.length)
</script>

<template>
  <div class="kw-roll">
    <div class="kw-roll-cols">
      <div class="kw-roll-col">
        <div class="kw-kicker">
          Old ReplicaSet · <code>{{ props.oldTag }}</code>
        </div>
        <TransitionGroup name="kw-roll-pods" tag="div" class="kw-roll-pods">
          <PodCard v-for="pod in oldPods" :key="pod.id" v-bind="pod" />
          <div v-if="oldPods.length === 0" key="old-empty" class="kw-roll-empty">
            scaled to 0 — kept for <code>rollout undo</code>
          </div>
        </TransitionGroup>
      </div>

      <div class="kw-roll-col">
        <div class="kw-kicker">
          New ReplicaSet · <code>{{ props.newTag }}</code>
        </div>
        <TransitionGroup name="kw-roll-pods" tag="div" class="kw-roll-pods">
          <PodCard v-for="pod in newPods" :key="pod.id" v-bind="pod" />
          <div v-if="newPods.length === 0" key="new-empty" class="kw-roll-empty">
            not created yet
          </div>
        </TransitionGroup>
      </div>
    </div>

    <div class="kw-roll-state">
      <span class="kw-roll-chip">desired&nbsp;<strong>{{ props.desired }}</strong></span>
      <span
        class="kw-roll-chip"
        :class="{ 'is-surge': total > props.desired, 'is-sync': total <= props.desired }"
      >
        total Pods&nbsp;<strong>{{ total }}</strong>
      </span>
      <span v-if="total > props.desired" class="kw-roll-chip is-surge">
        +{{ total - props.desired }} surge
      </span>
    </div>

    <div class="kw-roll-caption">
      <template v-if="props.step <= 0">
        Steady state — three Pods on <code>{{ props.oldTag }}</code>. Bump the image to start.
      </template>
      <template v-else-if="props.step === 1">
        <strong>maxSurge</strong> — a new-RS Pod is created <em>above</em> desired before any
        old Pod leaves, so capacity never dips.
      </template>
      <template v-else-if="props.step === 2">
        The new Pod is <code>Ready</code>, so <strong>maxUnavailable</strong> now lets one old
        Pod terminate. Up as down, one step at a time.
      </template>
      <template v-else>
        Migration complete — the old ReplicaSet is drained to <strong>0</strong> but kept, so
        <code>rollout undo</code> can promote it back instantly.
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-roll {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.kw-roll-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.2rem;
}

.kw-roll-col {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.kw-roll-pods {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  min-height: 13rem;
  position: relative;
}

.kw-roll-empty {
  font-size: 0.74rem;
  color: var(--kw-text-faint);
  border: 1px dashed var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.55rem 0.7rem;
}

.kw-roll-state {
  display: flex;
  gap: 0.6rem;
  align-items: center;
  flex-wrap: wrap;
}

.kw-roll-chip {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.25rem 0.7rem;
  transition: all 0.4s ease;
}

.kw-roll-chip.is-surge {
  color: var(--kw-warn);
  border-color: var(--kw-warn);
}

.kw-roll-chip.is-sync {
  color: var(--kw-ok);
  border-color: var(--kw-ok);
}

.kw-roll-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 2.4rem;
}

.kw-roll-pods-enter-active,
.kw-roll-pods-leave-active,
.kw-roll-pods-move {
  transition: all 0.5s ease;
}

.kw-roll-pods-enter-from {
  opacity: 0;
  transform: translateX(1.5rem);
}

.kw-roll-pods-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.kw-roll-pods-leave-active {
  position: absolute;
}
</style>

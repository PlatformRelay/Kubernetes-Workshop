<script setup lang="ts">
import { usePodReplace } from './usePodReplace'

const { step, playing, specImage, pods, play } = usePodReplace()
</script>

<template>
  <div class="kw-panel kw-scene">
    <div class="kw-scene-header">
      <span class="kw-kicker">Deployment / web</span>
      <code class="kw-scene-spec" :class="{ 'kw-scene-spec-changed': step >= 1 }">
        image: {{ specImage }}
      </code>
      <button class="kw-scene-play" :disabled="playing" @click="play">
        {{ playing ? 'playing…' : '▶ replay' }}
      </button>
    </div>

    <TransitionGroup name="kw-pods" tag="div" class="kw-scene-pods">
      <PodCard v-for="pod in pods" :key="pod.id" v-bind="pod" />
    </TransitionGroup>
  </div>
</template>

<style scoped>
.kw-scene {
  padding: 1rem 1.2rem;
}

.kw-scene-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.kw-scene-spec {
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-border);
  border-radius: 6px;
  padding: 0.2rem 0.6rem;
  font-size: 0.78rem;
  color: var(--kw-text-dim);
  transition: color 0.4s, border-color 0.4s;
}

.kw-scene-spec-changed {
  color: var(--kw-accent-soft);
  border-color: var(--kw-accent);
}

.kw-scene-play {
  margin-left: auto;
  font-size: 0.72rem;
  color: var(--kw-text-dim);
  border: 1px solid var(--kw-border);
  border-radius: 6px;
  padding: 0.2rem 0.7rem;
  background: var(--kw-bg-soft);
  cursor: pointer;
}

.kw-scene-play:disabled {
  opacity: 0.5;
  cursor: default;
}

.kw-scene-pods {
  display: flex;
  gap: 1rem;
  min-height: 6.5rem;
  position: relative;
}

/* Pure CSS transitions: enter from below, leave by fading and shrinking. */
.kw-pods-enter-active,
.kw-pods-leave-active,
.kw-pods-move {
  transition: all 0.6s ease;
}

.kw-pods-enter-from {
  opacity: 0;
  transform: translateY(1.2rem) scale(0.9);
}

.kw-pods-leave-to {
  opacity: 0;
  transform: scale(0.85);
}

.kw-pods-leave-active {
  position: absolute;
}
</style>

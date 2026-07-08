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

    <!--
      @vueuse/motion drives enter/leave with spring physics via v-motion
      variants; contrast with the CSS-transition variant, which needs
      TransitionGroup instead.
    -->
    <div class="kw-scene-pods">
      <PodCard
        v-for="pod in pods"
        :key="pod.id"
        v-bind="pod"
        v-motion
        :initial="{ opacity: 0, y: 30, scale: 0.85 }"
        :enter="{
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { type: 'spring', stiffness: 220, damping: 16 },
        }"
      />
    </div>
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
}
</style>

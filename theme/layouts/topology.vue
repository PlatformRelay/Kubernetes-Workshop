<script setup lang="ts">
const props = defineProps<{
  heading?: string
  caption?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-topology">
    <header class="kw-topo-header">
      <h1 v-if="props.heading">{{ props.heading }}</h1>
      <slot name="title" />
    </header>

    <div class="kw-topo-canvas">
      <slot />
    </div>

    <footer v-if="props.caption" class="kw-topo-caption">{{ props.caption }}</footer>
  </div>
</template>

<style scoped>
.kw-topology {
  display: flex;
  flex-direction: column;
}

.kw-topo-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.6rem;
}

/* Dotted-grid canvas so architecture boxes read as a diagram, not a list. */
.kw-topo-canvas {
  flex: 1;
  min-height: 0;
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  background-color: var(--kw-bg-soft);
  background-image: radial-gradient(
    color-mix(in srgb, var(--kw-border) 70%, transparent) 1px,
    transparent 1px
  );
  background-size: 22px 22px;
  padding: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.kw-topo-caption {
  margin-top: 0.6rem;
  font-size: 0.8rem;
  color: var(--kw-text-dim);
  text-align: center;
}
</style>

<script setup lang="ts">
const props = defineProps<{
  /** Asset path, e.g. `/diagrams/diagram-c01a-layers.png`. */
  src: string
  /** Tighter panel for code-annotated rails and side columns. */
  compact?: boolean
}>()

const base = import.meta.env.BASE_URL

function resolveAsset(url: string) {
  return url.startsWith('/') ? base + url.slice(1) : url
}
</script>

<!-- Bit's hologram — AI-generated conceptual diagram in a dark panel. -->
<template>
  <figure class="kw-bit-hologram kw-panel" :class="{ 'kw-bit-hologram--compact': props.compact }">
    <img class="kw-bit-hologram-img" :src="resolveAsset(props.src)" alt="" />
    <figcaption class="kw-ai-footer">AI generated</figcaption>
  </figure>
</template>

<style scoped>
.kw-bit-hologram {
  position: relative;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.kw-bit-hologram-img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  object-position: center right;
}

.kw-bit-hologram--compact .kw-bit-hologram-img {
  aspect-ratio: 4 / 3;
}

.kw-bit-hologram .kw-ai-footer {
  position: absolute;
  right: 0.5rem;
  bottom: 0.45rem;
  font-size: 0.52rem;
  padding: 0.1rem 0.35rem;
}
</style>

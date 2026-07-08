<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Path under public, e.g. `/diagrams/diagram-c01a-layers.png`. */
    src: string
    /** Compact panel for dense code-annotated rails. */
    compact?: boolean
  }>(),
  { compact: false },
)

const base = import.meta.env.BASE_URL

function resolveAsset(url: string) {
  return url.startsWith('/') ? base + url.slice(1) : url
}
</script>

<!-- Bit's hologram: AI diagram panel with mandatory footer for content slides. -->
<template>
  <div class="kw-hologram" :class="{ 'kw-hologram--compact': props.compact }">
    <img class="kw-hologram-image" :src="resolveAsset(props.src)" alt="" />
    <div class="kw-ai-footer">AI generated</div>
  </div>
</template>

<style scoped>
.kw-hologram {
  position: relative;
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  background: color-mix(in srgb, var(--kw-panel) 85%, var(--kw-accent) 15%);
  overflow: hidden;
  min-width: 0;
}

.kw-hologram-image {
  display: block;
  width: 100%;
  height: auto;
  object-fit: cover;
}

.kw-hologram--compact .kw-hologram-image {
  max-height: 11rem;
  object-fit: cover;
  object-position: center right;
}

.kw-hologram .kw-ai-footer {
  position: absolute;
  right: 0.45rem;
  bottom: 0.35rem;
  font-size: 0.52rem;
  opacity: 0.85;
}
</style>

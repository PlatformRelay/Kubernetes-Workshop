<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Optional section-cover artwork (e.g. the Mœbius-style images). */
    image?: string
    /** Day label, e.g. "Day 1". */
    day?: string
    /** Section number within the day, e.g. "03". */
    section?: string
    /**
     * Whether the artwork is AI-generated. Defaults to true because the planned
     * section covers are; the "AI generated" footer is mandatory for those.
     */
    aiGenerated?: boolean
  }>(),
  { aiGenerated: true },
)
</script>

<template>
  <div class="slidev-layout kw-section-cover">
    <img v-if="props.image" class="kw-cover-image" :src="props.image" alt="" />
    <div class="kw-cover-overlay" />

    <div class="kw-cover-body">
      <div class="kw-cover-meta">
        <img src="/icons/kubernetes-icon-white.svg" alt="Kubernetes" class="kw-cover-logo" />
        <span v-if="props.day" class="kw-kicker">{{ props.day }}</span>
        <span v-if="props.section" class="kw-kicker kw-cover-section">§ {{ props.section }}</span>
      </div>
      <div class="kw-cover-title">
        <slot />
      </div>
    </div>

    <div v-if="props.image && props.aiGenerated" class="kw-ai-footer">AI generated</div>
  </div>
</template>

<style scoped>
.kw-section-cover {
  position: relative;
  padding: 0;
  overflow: hidden;
}

.kw-cover-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kw-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to top,
    color-mix(in srgb, var(--kw-bg) 92%, transparent) 20%,
    color-mix(in srgb, var(--kw-bg) 45%, transparent) 60%,
    color-mix(in srgb, var(--kw-bg) 25%, transparent)
  );
}

.kw-cover-body {
  position: absolute;
  left: 3.5rem;
  right: 3.5rem;
  bottom: 3rem;
}

.kw-cover-meta {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  margin-bottom: 0.8rem;
}

.kw-cover-logo {
  height: 1.6rem;
}

.kw-cover-section {
  color: var(--kw-text-dim);
}

.kw-cover-title :deep(h1) {
  font-size: 2.6rem;
  line-height: 1.15;
  margin: 0;
}

.kw-cover-title :deep(p) {
  color: var(--kw-text-dim);
  margin-top: 0.5rem;
}

.kw-ai-footer {
  position: absolute;
  right: 0.9rem;
  bottom: 0.7rem;
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--kw-text-dim);
  background: color-mix(in srgb, var(--kw-bg) 75%, transparent);
  border: 1px solid var(--kw-border);
  border-radius: 4px;
  padding: 0.15rem 0.45rem;
}
</style>

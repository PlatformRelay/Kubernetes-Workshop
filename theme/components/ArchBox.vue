<script setup lang="ts">
const props = defineProps<{
  heading?: string
  /** Small mono sub-label, e.g. "control plane" or an IP. */
  sub?: string
  /** plain (default) · plane (accent header) · node (dashed) */
  variant?: 'plain' | 'plane' | 'node'
}>()
</script>

<!-- Titled container for architecture scenes; children flow as a wrapping row. -->
<template>
  <div class="kw-arch-box" :class="`kw-arch-box--${props.variant ?? 'plain'}`">
    <div v-if="props.heading || props.sub" class="kw-arch-box-head">
      <span v-if="props.heading" class="kw-arch-box-title">{{ props.heading }}</span>
      <span v-if="props.sub" class="kw-arch-box-sub">{{ props.sub }}</span>
    </div>
    <div class="kw-arch-box-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.kw-arch-box {
  background: color-mix(in srgb, var(--kw-panel) 80%, transparent);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.6rem 0.75rem;
  min-width: 0;
}

.kw-arch-box--plane {
  border-color: color-mix(in srgb, var(--kw-accent) 45%, var(--kw-border));
}

.kw-arch-box--plane .kw-arch-box-title {
  color: var(--kw-accent-bright);
}

.kw-arch-box--node {
  border-style: dashed;
}

.kw-arch-box-head {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.kw-arch-box-title {
  font-weight: 650;
  font-size: 0.82rem;
}

.kw-arch-box-sub {
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.62rem;
  letter-spacing: 0.06em;
  color: var(--kw-text-faint);
}

.kw-arch-box-body {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
}
</style>

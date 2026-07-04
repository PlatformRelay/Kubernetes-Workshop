<script setup lang="ts">
const props = defineProps<{
  /** default (outline) · accent · ok · warn · danger */
  variant?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
}>()
</script>

<!-- Small pill for tiers, environments, versions: <KwChip>core</KwChip> -->
<template>
  <span class="kw-chip" :class="`kw-chip--${props.variant ?? 'default'}`">
    <slot />
  </span>
</template>

<style scoped>
.kw-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-family: var(--slidev-code-font-family, monospace);
  font-size: 0.68rem;
  letter-spacing: 0.05em;
  color: var(--kw-text-dim);
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: 999px;
  padding: 0.18rem 0.65rem;
  white-space: nowrap;
}

.kw-chip--accent {
  color: var(--kw-accent-bright);
  border-color: color-mix(in srgb, var(--kw-accent) 55%, var(--kw-border));
}

.kw-chip--ok {
  color: var(--kw-ok);
  border-color: color-mix(in srgb, var(--kw-ok) 45%, var(--kw-border));
}

.kw-chip--warn {
  color: var(--kw-warn);
  border-color: color-mix(in srgb, var(--kw-warn) 45%, var(--kw-border));
}

.kw-chip--danger {
  color: var(--kw-danger);
  border-color: color-mix(in srgb, var(--kw-danger) 45%, var(--kw-border));
}
</style>

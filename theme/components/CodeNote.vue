<script setup lang="ts">
const props = defineProps<{
  /**
   * Click index this note appears at. Pair it with the code block's highlight
   * steps: with ```yaml {none|2-4|6-9}``` use at="1" and at="2".
   */
  at?: string | number
  /** Field or command the note points at, rendered as code. */
  label?: string
  /** accent (default) · ok · warn · danger */
  variant?: 'accent' | 'ok' | 'warn' | 'danger'
}>()
</script>

<!-- Side-rail annotation for the code-annotated layout. -->
<template>
  <v-click :at="props.at">
    <div class="kw-code-note" :class="`kw-code-note--${props.variant ?? 'accent'}`">
      <code v-if="props.label" class="kw-code-note-label">{{ props.label }}</code>
      <div class="kw-code-note-body">
        <slot />
      </div>
    </div>
  </v-click>
</template>

<style scoped>
.kw-code-note {
  --kw-note-color: var(--kw-accent);
  background: var(--kw-panel-2);
  border: 1px solid var(--kw-border);
  border-left: 3px solid var(--kw-note-color);
  border-radius: var(--kw-radius-sm);
  padding: 0.55rem 0.8rem;
}

.kw-code-note--ok {
  --kw-note-color: var(--kw-ok);
}

.kw-code-note--warn {
  --kw-note-color: var(--kw-warn);
}

.kw-code-note--danger {
  --kw-note-color: var(--kw-danger);
}

.kw-code-note-label {
  display: inline-block;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.72rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--kw-note-color) 65%, var(--kw-text));
  margin-bottom: 0.15rem;
}

.kw-code-note-body {
  font-size: 0.8rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
}

.kw-code-note-body :deep(strong) {
  color: var(--kw-text);
}
</style>

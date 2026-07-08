<script setup lang="ts">
const props = defineProps<{
  /** Click index this callout appears at (0 = visible immediately). */
  at?: string | number
  /** Absolute position on the slide, e.g. top="24%" right="4%". */
  top: string
  left?: string
  right?: string
  width?: string
  /** Which edge carries the pointer arrow (points toward the code). */
  side?: 'left' | 'right' | 'top' | 'bottom'
  /** Field or command the callout points at, rendered as code. */
  label?: string
  /** accent (default) · ok · warn · danger */
  variant?: 'accent' | 'ok' | 'warn' | 'danger'
}>()
</script>

<!--
  Floating annotation overlaid on a code block. Position it manually per
  slide; wrap-free — the component brings its own v-click.
-->
<template>
  <v-click :at="props.at">
    <div
      class="kw-code-callout"
      :class="[
        `kw-code-callout--${props.variant ?? 'accent'}`,
        `kw-code-callout--arrow-${props.side ?? 'left'}`,
      ]"
      :style="{ top: props.top, left: props.left, right: props.right, width: props.width ?? '15rem' }"
    >
      <code v-if="props.label" class="kw-code-callout-label">{{ props.label }}</code>
      <div class="kw-code-callout-body">
        <slot />
      </div>
    </div>
  </v-click>
</template>

<style scoped>
.kw-code-callout {
  --kw-callout-color: var(--kw-accent);
  position: absolute;
  z-index: 10;
  background: var(--kw-panel-2);
  border: 1px solid color-mix(in srgb, var(--kw-callout-color) 55%, var(--kw-border));
  border-radius: var(--kw-radius-sm);
  padding: 0.5rem 0.75rem;
  box-shadow: 0 8px 28px color-mix(in srgb, var(--kw-bg) 80%, transparent);
}

.kw-code-callout--ok {
  --kw-callout-color: var(--kw-ok);
}

.kw-code-callout--warn {
  --kw-callout-color: var(--kw-warn);
}

.kw-code-callout--danger {
  --kw-callout-color: var(--kw-danger);
}

/* Pointer arrow */
.kw-code-callout::before {
  content: '';
  position: absolute;
  border: 7px solid transparent;
}

.kw-code-callout--arrow-left::before {
  left: -14px;
  top: 0.8rem;
  border-right-color: color-mix(in srgb, var(--kw-callout-color) 55%, var(--kw-border));
}

.kw-code-callout--arrow-right::before {
  right: -14px;
  top: 0.8rem;
  border-left-color: color-mix(in srgb, var(--kw-callout-color) 55%, var(--kw-border));
}

.kw-code-callout--arrow-top::before {
  top: -14px;
  left: 1rem;
  border-bottom-color: color-mix(in srgb, var(--kw-callout-color) 55%, var(--kw-border));
}

.kw-code-callout--arrow-bottom::before {
  bottom: -14px;
  left: 1rem;
  border-top-color: color-mix(in srgb, var(--kw-callout-color) 55%, var(--kw-border));
}

.kw-code-callout-label {
  display: inline-block;
  background: none;
  border: none;
  padding: 0;
  font-size: 0.7rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--kw-callout-color) 65%, var(--kw-text));
  margin-bottom: 0.1rem;
}

.kw-code-callout-body {
  font-size: 0.75rem;
  line-height: 1.4;
  color: var(--kw-text-dim);
}

.kw-code-callout-body :deep(strong) {
  color: var(--kw-text);
}
</style>

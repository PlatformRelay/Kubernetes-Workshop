<script setup lang="ts">
import LabCallout from '../components/LabCallout.vue'

const props = defineProps<{
  heading?: string
  /** Optional lab reference chip. */
  lab?: string
}>()
</script>

<template>
  <div class="slidev-layout kw-two-cols-code">
    <header class="kw-tcc-header">
      <h1 v-if="props.heading">{{ props.heading }}</h1>
      <slot name="title" />
    </header>

    <div class="kw-tcc-cols">
      <div class="kw-tcc-left">
        <slot />
      </div>
      <div class="kw-tcc-right">
        <slot name="right" />
      </div>
    </div>

    <LabCallout v-if="props.lab" :lab="props.lab" class="kw-tcc-lab" />
  </div>
</template>

<style scoped>
.kw-two-cols-code {
  display: flex;
  flex-direction: column;
}

.kw-tcc-header h1 {
  font-size: 1.5rem;
  margin-bottom: 0.6rem;
}

.kw-tcc-cols {
  flex: 1;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 1.4rem;
  min-height: 0;
  align-items: center;
}

.kw-tcc-left :deep(pre.slidev-code) {
  font-size: 0.85em;
  line-height: 1.45;
}

.kw-tcc-right {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 0;
}

.kw-tcc-lab {
  position: absolute;
  right: 1.6rem;
  bottom: 1.2rem;
}
</style>

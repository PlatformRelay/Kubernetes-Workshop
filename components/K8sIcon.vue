<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    /** Icon file name under public/icons/, without extension. */
    name?:
      | 'kubernetes-icon-white'
      | 'kubernetes-icon-color'
      | 'kubernetes-horizontal-white-text'
      | 'cncf-icon-white'
      | 'cncf-white'
    /** CSS height, e.g. "2rem". */
    size?: string
  }>(),
  { name: 'kubernetes-icon-white', size: '2rem' },
)
</script>

<template>
  <img :src="`/icons/${props.name}.svg`" :style="{ height: props.size }" alt="" class="kw-icon" />
</template>

<style scoped>
.kw-icon {
  display: inline-block;
  vertical-align: middle;
}
</style>

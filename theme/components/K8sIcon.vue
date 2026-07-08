<script setup lang="ts">
/**
 * Static SVG icon loader for the deck.
 *
 * Two modes, both export-safe (<img> from public/, no build plugin — ADR 0001):
 *
 *   Brand logo:    <K8sIcon name="kubernetes-icon-color" />
 *   Resource glyph: <K8sIcon kind="deploy" />            (official k8s icon set)
 *                   <K8sIcon kind="svc" variant="unlabeled" />
 *
 * Resource glyphs are the official Kubernetes architecture-diagram icons
 * (Apache-2.0, from github.com/kubernetes/community). `labeled` carries the
 * resource-type text under the hexagon; `unlabeled` is the bare hexagon.
 * See public/icons/README.md for attribution.
 */

/** Official Kubernetes resource / component icon slugs vendored under public/icons/resources/. */
export type K8sKind =
  // workloads
  | 'pod' | 'deploy' | 'rs' | 'ds' | 'sts' | 'job' | 'cronjob' | 'hpa'
  // networking
  | 'svc' | 'ep' | 'ing' | 'netpol'
  // config & storage
  | 'cm' | 'secret' | 'pv' | 'pvc' | 'quota'
  // cluster
  | 'ns' | 'sa' | 'crd'
  // control plane (labeled only upstream)
  | 'api' | 'c-m' | 'c-c-m' | 'sched' | 'kubelet' | 'k-proxy'
  // infrastructure
  | 'node' | 'etcd' | 'control-plane'

const props = withDefaults(
  defineProps<{
    /** Brand logo file under public/icons/, without extension. Ignored when `kind` is set. */
    name?:
      | 'kubernetes-icon-white'
      | 'kubernetes-icon-color'
      | 'kubernetes-horizontal-white-text'
      | 'cncf-icon-white'
      | 'cncf-white'
    /** Official Kubernetes resource glyph. Takes precedence over `name`. */
    kind?: K8sKind
    /** Resource glyph style: with type-label text or bare hexagon. */
    variant?: 'labeled' | 'unlabeled'
    /** CSS height, e.g. "2rem". */
    size?: string
    /** Accessible label; falls back to the kind slug. */
    alt?: string
  }>(),
  { name: 'kubernetes-icon-white', variant: 'labeled', size: '2rem' },
)

const base = import.meta.env.BASE_URL

const src = props.kind
  ? `${base}icons/resources/${props.variant}/${props.kind}.svg`
  : `${base}icons/${props.name}.svg`
</script>

<template>
  <img
    :src="src"
    :style="{ height: props.size }"
    :alt="props.alt ?? props.kind ?? ''"
    class="kw-icon"
  />
</template>

<style scoped>
.kw-icon {
  display: inline-block;
  vertical-align: middle;
}
</style>

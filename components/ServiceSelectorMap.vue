<script setup lang="ts">
/**
 * Styled selector → EndpointSlice → Pods diagram (replaces default mermaid on S07).
 * Bind `:step="$clicks"` for progressive reveal.
 */
const props = withDefaults(
  defineProps<{
    step?: number
    serviceName?: string
    selector?: string
    namespace?: string
  }>(),
  {
    step: 0,
    serviceName: 'web',
    selector: 'app=web',
    namespace: 'default',
  },
)

const dns = () => `${props.serviceName}.${props.namespace}.svc.cluster.local`
const pods = [
  { name: 'web-x2lqp', ip: '10.244.0.7' },
  { name: 'web-7nqld', ip: '10.244.0.8' },
  { name: 'web-lm4tt', ip: '10.244.0.9' },
]
</script>

<template>
  <div class="kw-ssm">
    <div class="kw-ssm-row">
      <div class="kw-ssm-box kw-ssm-dns" :class="{ 'is-lit': step >= 0 }">
        <div class="kw-kicker">Cluster DNS</div>
        <code class="kw-ssm-code">{{ dns() }}</code>
        <div class="kw-ssm-sub">short name: <code>{{ serviceName }}</code></div>
      </div>

      <div class="kw-ssm-arrow" :class="{ 'is-lit': step >= 1 }">→</div>

      <div class="kw-ssm-box kw-ssm-svc" :class="{ 'is-lit': step >= 1 }">
        <div class="kw-ssm-box-head">
          <K8sIcon kind="svc" variant="unlabeled" size="1.35rem" />
          <span>Service</span>
        </div>
        <code class="kw-ssm-code">{{ serviceName }}</code>
        <div class="kw-ssm-chip">ClusterIP · stable</div>
        <div class="kw-ssm-sel">
          selector <code>{{ selector }}</code>
        </div>
      </div>

      <div class="kw-ssm-arrow" :class="{ 'is-lit': step >= 2 }">→</div>

      <div class="kw-ssm-box kw-ssm-eps" :class="{ 'is-lit': step >= 2 }">
        <div class="kw-ssm-box-head">
          <K8sIcon kind="ep" variant="unlabeled" size="1.35rem" />
          <span>EndpointSlice</span>
        </div>
        <div class="kw-ssm-eps-list">
          <code v-for="p in pods" :key="p.ip" class="kw-ssm-ep">{{ p.ip }}</code>
        </div>
        <div class="kw-ssm-sub">live list — rewritten on every Pod change</div>
      </div>
    </div>

    <div class="kw-ssm-pods" :class="{ 'is-lit': step >= 3 }">
      <div v-for="p in pods" :key="p.name" class="kw-ssm-pod">
        <K8sIcon kind="pod" variant="unlabeled" size="1rem" />
        <code>{{ p.name }}</code>
        <span class="kw-ssm-pod-ip">{{ p.ip }}</span>
      </div>
    </div>

    <p class="kw-ssm-caption">
      <template v-if="step <= 1">
        Clients dial a <strong>stable name</strong>; the Service's
        <code>selector</code> is a continuous label query.
      </template>
      <template v-else-if="step === 2">
        Matching Pod IPs land in an <strong>EndpointSlice</strong> — not the legacy
        <code>Endpoints</code> object.
      </template>
      <template v-else>
        Pods churn beneath a fixed front door. Wrong selector → empty slice, green Service,
        dead traffic — Lab 07's silent failure.
      </template>
    </p>
  </div>
</template>

<style scoped>
.kw-ssm {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.kw-ssm-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr auto 1fr;
  gap: 0.45rem;
  align-items: stretch;
}

.kw-ssm-box {
  background: var(--kw-panel);
  border: 1px solid var(--kw-border);
  border-radius: var(--kw-radius-sm);
  padding: 0.55rem 0.65rem;
  opacity: 0.35;
  transition: opacity 0.25s, border-color 0.25s, box-shadow 0.25s;
}

.kw-ssm-box.is-lit {
  opacity: 1;
}

.kw-ssm-dns.is-lit {
  border-color: color-mix(in srgb, var(--kw-accent-bright) 50%, var(--kw-border));
}

.kw-ssm-svc.is-lit {
  border-color: color-mix(in srgb, var(--kw-accent) 55%, var(--kw-border));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kw-accent) 20%, transparent);
}

.kw-ssm-eps.is-lit {
  border-color: color-mix(in srgb, var(--kw-ok) 50%, var(--kw-border));
}

.kw-ssm-box-head {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 650;
  margin-bottom: 0.25rem;
}

.kw-ssm-code {
  display: block;
  font-size: 0.76rem;
  word-break: break-all;
}

.kw-ssm-sub {
  font-size: 0.68rem;
  color: var(--kw-text-faint);
  margin-top: 0.25rem;
}

.kw-ssm-chip {
  display: inline-block;
  margin-top: 0.25rem;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--kw-accent-bright);
  background: color-mix(in srgb, var(--kw-accent) 12%, var(--kw-panel-2));
  border: 1px solid color-mix(in srgb, var(--kw-accent) 30%, var(--kw-border));
  border-radius: 4px;
  padding: 0.1rem 0.35rem;
}

.kw-ssm-sel {
  margin-top: 0.35rem;
  font-size: 0.72rem;
  color: var(--kw-text-dim);
  padding: 0.25rem 0.35rem;
  background: var(--kw-bg-soft);
  border-radius: 4px;
  border-left: 2px solid var(--kw-warn);
}

.kw-ssm-eps-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin: 0.25rem 0;
}

.kw-ssm-ep {
  font-size: 0.72rem;
  background: color-mix(in srgb, var(--kw-ok) 12%, var(--kw-panel-2));
  border: 1px solid color-mix(in srgb, var(--kw-ok) 35%, var(--kw-border));
  border-radius: 4px;
  padding: 0.12rem 0.35rem;
}

.kw-ssm-arrow {
  align-self: center;
  color: var(--kw-text-faint);
  font-size: 1.1rem;
  opacity: 0.25;
  transition: opacity 0.25s, color 0.25s;
}

.kw-ssm-arrow.is-lit {
  opacity: 1;
  color: var(--kw-accent-bright);
}

.kw-ssm-pods {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  justify-content: center;
  opacity: 0.3;
  transition: opacity 0.25s;
}

.kw-ssm-pods.is-lit {
  opacity: 1;
}

.kw-ssm-pod {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  background: var(--kw-panel-2);
  border: 1px solid var(--kw-border);
  border-left: 3px solid var(--kw-accent);
  border-radius: var(--kw-radius-sm);
  padding: 0.3rem 0.5rem;
}

.kw-ssm-pod-ip {
  color: var(--kw-text-faint);
  font-family: var(--slidev-code-font-family, monospace);
}

.kw-ssm-caption {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.45;
  color: var(--kw-text-dim);
  text-align: center;
}

.kw-ssm-caption :deep(strong) {
  color: var(--kw-text);
}
</style>

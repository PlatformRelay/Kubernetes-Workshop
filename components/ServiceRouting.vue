<script setup lang="ts">
import { computed } from 'vue'

/**
 * Click-driven service routing — the shared US-X3 animation.
 * Bind `:step="$clicks"`. Shows the wiring a Service actually is:
 * selector → EndpointSlice → Pods, then the readiness variant that first marks a
 * Pod NotReady and only then removes it from the slice, without deleting it
 * (the bridge S14 reuses).
 *
 * Pure Vue + CSS on the kw-* vocabulary (ADR 0001); every fixed `step` is a
 * meaningful static state for export. Parameterized (serviceName / selector /
 * pods / removeAt) so S14 can reuse it for the readiness-probe story.
 * `removeAt` is the step at which the endpoint leaves the slice; the readiness
 * probe fails one step earlier, at `removeAt - 1`.
 *
 * step 0: Service + selector, all Pods in the slice (steady state)
 * step 1: a request fans out across all endpoints (load-balanced)
 * step 2: one Pod's readiness probe fails → NotReady, but its IP is still in the slice
 *         (still a traffic target — kube-proxy has not dropped it yet)
 * step 3: the endpoint controller drops the IP from the slice → traffic reroutes to the rest
 */
interface RoutePod {
  name: string
  ip: string
}

const props = withDefaults(
  defineProps<{
    step?: number
    serviceName?: string
    selector?: string
    reason?: string
    pods?: RoutePod[]
    removeAt?: number
  }>(),
  {
    step: 0,
    serviceName: 'web',
    selector: 'app: web',
    reason: 'com a readiness probe falhando',
    pods: () => [
      { name: 'web-6f8c-x2lqp', ip: '10.244.0.7' },
      { name: 'web-6f8c-7nqld', ip: '10.244.0.8' },
      { name: 'web-6f8c-lm4tt', ip: '10.244.0.9' },
    ],
    removeAt: 3,
  },
)

// The last Pod's readiness probe fails one step BEFORE its endpoint is removed:
// NotReady at removeAt - 1 (IP still listed), gone from the slice at removeAt.
const isReady = (i: number) => !(props.step >= props.removeAt - 1 && i === props.pods.length - 1)
const isRemoved = (i: number) => props.step >= props.removeAt && i === props.pods.length - 1
const isLeaving = (i: number) => !isReady(i) && !isRemoved(i)
const routing = computed(() => props.step >= 1)
const endpoints = computed(() =>
  props.pods
    .map((p, i) => ({ ip: p.ip, leaving: isLeaving(i), removed: isRemoved(i) }))
    .filter((e) => !e.removed),
)
</script>

<template>
  <div class="kw-route">
    <div class="kw-route-flow">
      <!-- Service + selector + live EndpointSlice -->
      <div class="kw-route-svc">
        <div class="kw-kicker">Service · ClusterIP</div>
        <code class="kw-route-svc-name">{{ props.serviceName }}</code>
        <div class="kw-route-sel">selector <code>{{ props.selector }}</code></div>
        <div class="kw-route-slice">
          <div class="kw-route-slice-label">EndpointSlice</div>
          <TransitionGroup name="kw-route-ep" tag="div" class="kw-route-eps">
            <code
              v-for="ep in endpoints"
              :key="ep.ip"
              class="kw-route-ep"
              :class="{ 'is-leaving': ep.leaving }"
              >{{ ep.ip }}</code
            >
            <span v-if="endpoints.length === 0" key="empty" class="kw-route-ep is-empty"
              >&lt;none&gt;</span
            >
          </TransitionGroup>
        </div>
      </div>

      <div class="kw-route-arrow" :class="{ 'is-live': routing }">→</div>

      <!-- Pods, each in/out of the slice by readiness -->
      <div class="kw-route-pods">
        <div
          v-for="(pod, i) in props.pods"
          :key="pod.name"
          class="kw-route-pod"
          :class="{
            'is-out': isRemoved(i),
            'is-failing': isLeaving(i),
            'is-hot': routing && !isRemoved(i),
          }"
        >
          <div class="kw-route-pod-head">
            <K8sIcon kind="pod" variant="unlabeled" size="0.95rem" alt="" class="kw-route-pod-logo" />
            <code class="kw-route-pod-name">{{ pod.name }}</code>
          </div>
          <div class="kw-route-pod-foot">
            <code class="kw-route-pod-ip">{{ pod.ip }}</code>
            <span class="kw-route-pod-ready" :class="isReady(i) ? 'is-ready' : 'is-notready'">
              {{ isReady(i) ? 'Ready ✓' : 'NotReady ✗' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="kw-route-caption">
      <template v-if="props.step <= 0">
        Um Service é um <strong>selector</strong>. O endpoint controller casa
        <code>{{ props.selector }}</code> e escreve o IP de cada Pod na
        <strong>EndpointSlice</strong> — a lista viva de quem está por trás do ClusterIP estável.
      </template>
      <template v-else-if="props.step < props.removeAt - 1">
        Uma requisição ao ClusterIP faz <strong>load-balance</strong> entre todos os endereços
        da slice — três Pods, três formas de responder.
      </template>
      <template v-else-if="props.step < props.removeAt">
        Um Pod está <strong>{{ props.reason }}</strong>: ele vira <strong>NotReady</strong> —
        ainda <code>Running</code>, e por um instante seu IP ainda está na slice. O endpoint
        controller ainda não reagiu.
      </template>
      <template v-else>
        Agora o endpoint controller <strong>remove o IP da slice</strong> — o tráfego é
        redirecionado para os dois saudáveis, sem erro para quem chama.
        <span class="kw-muted">(É exatamente o comportamento de readiness sobre o qual o S14 se apoia.)</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.kw-route {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.kw-route-flow {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.kw-route-svc {
  flex: 0 0 auto;
  width: 15rem;
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-accent);
  border-radius: var(--kw-radius);
  padding: 0.8rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.kw-route-svc-name {
  background: none;
  padding: 0;
  font-size: 1rem;
  color: var(--kw-accent-bright);
}

.kw-route-sel {
  font-size: 0.74rem;
  color: var(--kw-text-dim);
}

.kw-route-slice {
  margin-top: 0.2rem;
  border-top: 1px dashed var(--kw-border);
  padding-top: 0.5rem;
}

.kw-route-slice-label {
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--kw-text-faint);
  margin-bottom: 0.35rem;
}

.kw-route-eps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  min-height: 1.7rem;
  position: relative;
}

.kw-route-ep {
  font-size: 0.72rem;
  background: var(--kw-bg-soft);
  border: 1px solid var(--kw-ok);
  color: var(--kw-ok);
  border-radius: var(--kw-radius-sm);
  padding: 0.15rem 0.45rem;
}

.kw-route-ep.is-empty {
  border-color: var(--kw-danger);
  color: var(--kw-danger);
}

/* The failing Pod's IP while it is NotReady but not yet dropped from the slice. */
.kw-route-ep.is-leaving {
  border-color: var(--kw-danger);
  color: var(--kw-danger);
  border-style: dashed;
}

.kw-route-arrow {
  font-size: 1.6rem;
  color: var(--kw-text-faint);
  transition: color 0.4s ease;
}

.kw-route-arrow.is-live {
  color: var(--kw-accent-bright);
}

.kw-route-pods {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  flex: 1 1 auto;
}

.kw-route-pod {
  background: var(--kw-panel);
  border: 1.5px solid var(--kw-border);
  border-radius: var(--kw-radius);
  padding: 0.5rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  transition: all 0.45s ease;
}

.kw-route-pod.is-hot {
  border-color: var(--kw-accent);
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-route-pod.is-out {
  opacity: 0.5;
  border-color: var(--kw-danger);
}

/* Readiness failed, endpoint not yet removed: alarmed but still fully present. */
.kw-route-pod.is-failing {
  border-color: var(--kw-danger);
  box-shadow: 0 0 0 1px var(--kw-danger) inset;
}

/* Probe failed, IP still in the slice: keep the traffic highlight. is-failing
   alone would paint the pod as already off the path. */
.kw-route-pod.is-hot.is-failing {
  border-color: var(--kw-accent);
  box-shadow: 0 0 0 1px var(--kw-accent) inset;
}

.kw-route-pod-head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.kw-route-pod-logo {
  height: 0.95rem;
}

.kw-route-pod-name {
  background: none;
  padding: 0;
  font-size: 0.74rem;
  color: var(--kw-text);
}

.kw-route-pod-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.kw-route-pod-ip {
  background: none;
  padding: 0;
  font-size: 0.7rem;
  color: var(--kw-text-dim);
}

.kw-route-pod-ready {
  font-size: 0.68rem;
  font-weight: 600;
}

.kw-route-pod-ready.is-ready {
  color: var(--kw-ok);
}

.kw-route-pod-ready.is-notready {
  color: var(--kw-danger);
}

.kw-route-caption {
  font-size: 0.82rem;
  color: var(--kw-text-dim);
  min-height: 3rem;
}

.kw-route-ep-enter-active,
.kw-route-ep-leave-active,
.kw-route-ep-move {
  transition: all 0.45s ease;
}

.kw-route-ep-enter-from,
.kw-route-ep-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.kw-route-ep-leave-active {
  position: absolute;
}
</style>

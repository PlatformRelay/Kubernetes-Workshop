---
layout: section-cover
image: /covers/section-03-floating-blueprint-palace.webp
day: Day 1
section: '03'
tier: core
track: Foundations
---

# Modelo mental do Kubernetes

Uma grande ideia — reconciliação declarativa — e as peças que a executam.

**core** · sugerido para o Day 1 · trilha Foundations

<!--
Seção S03 — Modelo mental do Kubernetes. Duração: ~30 min de slides + 20 min de lab.
Resultado: as pessoas conseguem descrever o control plane, o node e o loop de
reconciliação, e ler estado desejado (spec) vs observado (status) — para que todo
recurso posterior se pendure em uma única ideia.
Beats: imperativo vs declarativo · componentes do control plane · componentes do
node (o runtime amarra de volta ao CRI do S01) · a animação do loop de
reconciliação (construída aqui primeiro, reutilizada por S21/S22) · spec vs
status em um objeto vivo.
Amarração CKx: CKA Cluster Architecture & core components.
Lab: labs/day-1/03-cluster-tour.md.
-->

---
layout: comparison
heading: 'Pare de dar ordens. Descreva o objetivo.'
leftHeading: Imperativo
rightHeading: Declarativo
leftBadge: 'faça X agora'
rightBadge: 'mantenha o mundo com esta cara'
---

- Você emite cada passo: *inicie isto*, *pare aquilo*, *agora escale para 4*.
- O sistema faz isso uma vez — e imediatamente começa a divergir.
- Um crash, um node perdido, um delete digitado errado → **você** precisa perceber e consertar.
- O estado vive na sua cabeça e no histórico do seu shell.

::right::

- Você submete o estado desejado: *devem existir 4 réplicas disto*.
- Um controller torna isso verdade — e **mantém** verdade.
- Um crash ou um node perdido é reparado automaticamente, sem você.
- O estado vive no cluster, como dados que você pode ler de volta.

<div class="mt-4 text-sm" v-click>

Quase tudo no Kubernetes é esse único movimento: **escreva o que você quer e deixe
um loop reconciliar a realidade em direção a isso.** O resto do dia é só *qual*
objeto você declara.

</div>

<!--
Speaker: esta é A ideia do workshop. `kubectl apply` não "roda" nada — ele registra
o estado desejado; um controller converge para ele. Tudo, de Pods a Gateways, é um
spec + um loop. O slide de reconciliação torna o loop concreto.
-->

---

<span class="kw-kicker">O cérebro do cluster</span>

# Control plane — onde o estado desejado vive

<div class="kw-cols-2 mt-4">
  <v-click at="1">
    <KwCard heading="API server" kind="api" kindVariant="labeled">
      A <strong>porta de entrada</strong>. Toda leitura e toda escrita passam por ele —
      validadas, autorizadas e então persistidas. O único componente que conversa com o etcd.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="etcd" kind="etcd" kindVariant="labeled" variant="plain">
      A <strong>fonte da verdade</strong>: um key/value store consistente que guarda o
      spec <em>e</em> o status de todo objeto. Perdeu o etcd, perdeu a memória do cluster.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Scheduler" kind="sched" kindVariant="labeled">
      Observa Pods <strong>ainda sem node</strong> e escolhe um — por resources,
      affinity, taints. Ele apenas <em>decide</em>; quem roda é o kubelet.
    </KwCard>
  </v-click>
  <v-click at="4">
    <KwCard heading="Controller manager" kind="c-m" kindVariant="labeled">
      Roda os <strong>loops de reconciliação</strong> — um por tipo de recurso (Deployment,
      ReplicaSet, Job…). É o motor do próximo slide.
    </KwCard>
  </v-click>
</div>

<div v-click="5" class="mt-6 kw-muted text-sm">

Tudo aqui é cliente do **API server** — nada escreve no etcd diretamente.
Esse ponto único de passagem é o que torna o modelo auditável.

</div>

<!--
Speaker: mantenha cada papel em uma linha só. O controller-manager é a estrela — é
ele que hospeda os loops que animamos em seguida. O etcd como "memória" prepara o
slide de spec vs status mais adiante.
-->

---

<span class="kw-kicker">O músculo do cluster</span>

# Nodes — onde os containers de fato rodam

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="kubelet" kind="kubelet" kindVariant="labeled">
      O <strong>agente</strong> do node. Observa no API server os Pods atribuídos ao seu
      node e os torna reais — depois reporta o <code>status</code> deles de volta.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="kube-proxy" kind="k-proxy" kindVariant="labeled" variant="plain">
      Programa a rede do node para que um <strong>Service IP</strong> alcance os Pods
      certos. Abrimos essa caixa na seção de Service.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Container runtime" icon="⚙️">
      O que o kubelet chama via <strong>CRI</strong> para fazer pull de images e iniciar
      containers — <strong>containerd / CRI-O → runc / crun</strong>.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-6 kw-muted text-sm">

Aquele box de runtime é a mesma **cadeia CRI da seção de containers** — `kubelet → CRI → OCI runtime →
namespaces + cgroups`. O Kubernetes agenda Pods; o runtime do node continua sendo só
o Linux isolando processos.

</div>

<!--
Speaker: aponte explicitamente de volta para o S01 — o "container runtime" aqui é
exatamente a pilha engine/runtime/CRI para a qual eles já construíram uma image. O
kubelet é o espelho, do lado do node, dos loops do control plane: ele também observa
desejado vs real, por node.
-->

---

<span class="kw-kicker">O loop único sobre o qual tudo roda</span>

# Reconciliação — observar, comparar, agir, repetir

<div class="mt-2">
  <ReconcileLoop :step="$clicks" />
</div>

<div class="mt-6 text-sm">
<v-clicks>

- **Ninguém mandou criar um Pod.** O loop percebeu a diferença e a fechou — isso é *self-healing*, de graça.
- **O mesmo loop roda para todo kind.** Deployment, Job, PVC e, mais adiante, seus próprios operators e o GitOps reconciliam desse mesmo jeito.
- **Ele nunca para.** Delete um Pod na mão e ele volta — o loop está sempre observando, comparando, convergindo.

</v-clicks>
</div>

<!--
Speaker: esta é a animação reutilizável de reconciliação (construída aqui primeiro,
US-X1; S21/S22 reutilizam o componente ReconcileLoop com outro label de controller).
Passe os cliques: Observar (um Pod se perdeu) → Comparar (desejado 3 ≠ observado 2)
→ Agir (criar 1) → Repetir (em sincronia, seguir observando). Crave a frase: `apply`
não age, ele declara; quem age é o loop. NOTA: mantenha o ReconcileLoop
parametrizado (props de controller/resource) para que S21/S22 possam reutilizá-lo
sem mudanças.
-->

---
layout: code-annotated
heading: 'Spec é o que você quer. Status é o que é.'
lab: labs/day-1/03-cluster-tour.md
---

```yaml {none|2-4|6-9}
kind: Pod
spec:                     # DESEJADO — você escreve isto
  containers:
    - image: ghcr.io/platformrelay/workshop-web:v1
status:                   # OBSERVADO — o sistema escreve isto
  phase: Running
  podIP: 10.244.1.7
  conditions: [...]
```

::notes::

<CodeNote at="1" label="spec — estado desejado">
A metade que <strong>você</strong> escreve e submete. Ela diz o que deveria ser
verdade. O API server a valida e a guarda no etcd, intocada pelo cluster.
</CodeNote>

<CodeNote at="2" label="status — estado observado" variant="ok">
A metade que o <strong>sistema</strong> escreve. Controllers e o kubelet reportam
aqui o que é <em>de fato</em> verdade. Você lê; você não define. Reconciliação é só
fechar a diferença entre esses dois blocos.
</CodeNote>

<!--
Speaker: `kubectl get pod -o yaml` em qualquer objeto vivo mostra os dois blocos — o
lab faz com que eles achem spec vs status em um Pod de verdade. "Reconciliação =
levar o status em direção ao spec" é a frase para deixar com eles. O lab
(labs/day-1/03-cluster-tour.md) passeia por um cluster real e aponta para as duas metades.
-->

---
layout: lab
lab: labs/day-1/03-cluster-tour.md
duration: 20 min
env: namespace ✓ (read-only alt) / kind ✓
---

## Lab 03 — Tour pelo cluster

- **Nodes:** `kubectl get nodes -o wide` — leia as colunas de SO, kernel e **runtime**
- **Schema:** `kubectl api-resources` e `kubectl explain pod.spec` — a API é autodocumentada
- **Componentes:** liste os Pods do control plane (kind) ou descreva seu namespace (compartilhado)
- **Quebre de propósito:** `kubectl explain pod.spce` → erro de digitação → conserte
- **Spec vs status:** pegue um objeto vivo com `-o yaml` e aponte para as duas metades

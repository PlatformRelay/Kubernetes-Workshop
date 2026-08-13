---
layout: section-cover
image: /covers/section-06-the-herd.webp
day: Day 1
section: '06'
tier: core
track: Core
---

# Deployment

"Linha vermelha" 2/5 · Um controller que mantém seus Pods vivos, os escala e faz
rollout de novas versões sem indisponibilidade.

**core** · sugerido para o Day 1 · trilha Core

<!--
Seção S06 — Deployment. Tempo: ~35 min de slides + 30 min de lab.
Resultado: os participantes conseguem envolver um Pod em um Deployment, explicar
a cadeia Deployment→ReplicaSet→Pod, conduzir um rolling update e fazer rollback.
Beats: problema (Pods avulsos não se curam/escalam) · cadeia de ownership ·
magic-move estendendo pod.yaml → deployment.yaml · animação de rolling update
(US-X2) · verbos de rollout + labels recomendados · escala (spec vs status) ·
recap rumo ao S07.
Red line: o deployment.yaml construído aqui É o manifesto de
labs/day-1/06-deployment, e envolve o pod.yaml do S05 sem alterações sob
spec.template. CKx: CKAD Deployments, rolling updates & rollbacks.
-->

---
layout: statement
kicker: O problema
---

Você deletou um Pod no Lab 05 e **nada o trouxe de volta.**

Um Pod avulso não consegue se curar, escalar nem fazer rollout de uma nova versão —
é uma vida única, sem substituto. Workloads reais entregam esse trabalho a um
**controller** que guarda um *estado desejado* e trabalha para mantê-lo verdadeiro.
Para aplicações stateless, esse controller é o **Deployment.**

<!--
Speaker: faça a chamada direta à punchline do S05 — o Pod deletado que continuou
deletado. O conserto não é "tome mais cuidado", é "deixe um controller ser dono
do Pod". Esta é a primeira vez que o loop de reconciliação do S03 vira algo que
eles seguram nas mãos. O Lab 06 vem depois desta seção.
-->

---

<span class="kw-kicker">Modelo mental</span>

# Um objeto que você edita, três que fazem o trabalho

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="Deployment" kind="deploy">
      O que <strong>você</strong> edita. Guarda o <code>template</code> do Pod e as
      <code>replicas</code> desejadas. Gerencia rollouts — é dono de
      <strong>ReplicaSets</strong>, não de Pods diretamente.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="ReplicaSet" kind="rs" variant="plain">
      Um por versão do template de Pod. Seu único trabalho: manter vivos exatamente
      <code>replicas</code> Pods do template <em>dele</em>. Uma nova image ⇒ um
      <strong>novo ReplicaSet</strong>.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="Pods" kind="pod">
      O Pod, cunhado a partir do template. Cada um carrega um
      <code>ownerReferences</code> apontando de volta para seu ReplicaSet — delete
      um e o dono o cunha de novo.
    </KwCard>
  </v-click>
</div>

<div v-click="4" class="mt-5 kw-muted text-sm">

`Deployment → ReplicaSet → Pods`. Você quase nunca toca um ReplicaSet à mão —
você edita o Deployment, e ele conduz o resto através do **loop de reconciliação
do modelo mental.**

</div>

<!--
Speaker: a surpresa-chave é o objeto do *meio*. As pessoas esperam
Deployment→Pods; o ReplicaSet no meio é o que faz rollouts e rollback
funcionarem — cada versão ganha seu próprio RS. Mostre ownerReferences depois, no
lab, com `kubectl get pod -o yaml`. Revele uma caixa por clique, depois a linha
da cadeia.
-->

---
layout: code-walkthrough
heading: 'Estenda o Pod — o mesmo spec, agora dentro de um template'
lab: labs/day-1/06-deployment.md
class: s06-walkthrough-fit
zoom: 0.82
---

````md magic-move
```yaml
# pod.yaml — a semente da red line que estendemos
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      resources:
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
```

```yaml
apiVersion: apps/v1        # workloads vivem em apps/v1, não no core v1
kind: Deployment           # Pod → Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3              # NOVO — quantos Pods você quer
  selector:
    matchLabels:
      app: web             # NOVO — quais Pods este Deployment possui
  template:                # tudo abaixo é o Pod, indentado um nível
    metadata:
      labels:
        app: web           # os labels do próprio Pod — precisam satisfazer o selector
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
```

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web          # precisa casar com template.metadata.labels abaixo
  template:
    metadata:
      labels:
        app: web        # os labels do Pod — o Service do Lab 07 seleciona estes
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 250m
              memory: 128Mi
```
````

<!--
Speaker: TRÊS frames. (1) o pod.yaml exato do S05 — "você já escreveu isto."
(2) o movimento que derruba todo mundo: a metadata se DIVIDE — a identidade do
Pod vai para dois lugares. Nome do Pod → metadata.name do Deployment; labels do
Pod → TANTO template.metadata.labels (carimbado em cada Pod) QUANTO
selector.matchLabels (como o Deployment os encontra). Todo o spec de container do
S05 cai sob spec.template SEM ALTERAÇÕES. (3) o arquivo limpo que você aplica —
este frame É o deployment.yaml de labs/day-1/06-deployment, byte a byte. Martele:
o selector precisa casar com os labels do template ou o API server rejeita.
-->

---
class: kw-slide-dense s06-roll-fit
zoom: 0.86
---

<span class="kw-kicker">A recompensa · rolling update</span>

# Mude a image → rollout sem downtime

<div class="mt-2 s06-roll-points-grid">
  <div v-click="1">

**`maxSurge`** deixa o novo ReplicaSet adicionar Pods *acima* do desejado primeiro — a capacidade nunca cai.

  </div>
  <div v-click="2">

**`maxUnavailable`** limita quantos Pods antigos podem estar fora ao mesmo tempo — aqui, um só sai depois que um novo fica `Ready`.

  </div>
  <div v-click="3">

O **ReplicaSet antigo é mantido em 0**, e é exatamente isso que torna o `rollout undo` instantâneo.

  </div>
</div>

<div class="mt-2">
  <RollingUpdate :step="$clicks" />
</div>

<!--
Speaker: esta é a animação compartilhada de rolling update US-X2, que pertence a
esta seção e é reutilizada pelo S12 (contraste com StatefulSet) e onde quer que
um rollout seja mostrado. Avance clique a clique: 3 estáveis → surge +1 (novo Pod
criado acima do desejado) → novo Ready, um antigo termina → migrado, RS antigo
drenado a 0. Fixe o par: maxSurge é o botão de "quanto a mais", maxUnavailable o
de "quanto a menos". Os defaults são 25% cada. O Passo 3 do Lab 06 observa
exatamente essa rotatividade com `kubectl get rs -w`.
-->

---
layout: code-annotated
heading: 'Opere: set image, observe, undo'
lab: labs/day-1/06-deployment.md
---

```bash {none|1|2|3|4}
kubectl set image deployment/web web=ghcr.io/platformrelay/workshop-web:v2
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
```

::notes::

<CodeNote at="1" label="set image">
Edita a image do template de Pod no lugar. Essa mudança de template é o que cunha
um <strong>novo ReplicaSet</strong> — o rollout que você acabou de assistir.
</CodeNote>

<CodeNote at="2" label="rollout status" variant="ok">
Bloqueia até todo Pod novo ficar <code>Ready</code> (ou o rollout estagnar). Seu
exit code é o seu gate de CI: <code>0</code> = entregue.
</CodeNote>

<CodeNote at="3" label="history">
Cada mudança de template é uma <strong>revision</strong> numerada. Esta é a
trilha de auditoria do que foi entregue e quando — mantida porque os ReplicaSets
antigos continuam por perto.
</CodeNote>

<CodeNote at="4" label="undo" variant="warn">
Promove o ReplicaSet anterior de volta às réplicas completas e drena o atual —
o rollout ao contrário. Sem editar YAML, sem redeploy.
</CodeNote>

<!--
Speaker: estes quatro verbos são o ciclo de vida completo do rollout. Enfatize
que o undo só é possível PORQUE o RS antigo foi mantido em 0 — amarre de volta ao
último frame da animação. O Passo 5 do Lab 06 faz a versão assustadora: rola uma
tag ruim, observa estagnar (os Pods antigos continuam servindo), depois undo.
Mencione que revisionHistoryLimit apara RSs antigos.
-->

---

<span class="kw-kicker">Escala &amp; labels</span>

# Escale editando o desejo; rotule para as ferramentas encontrarem

<div class="kw-cols-2 mt-3">
  <div>

```bash
kubectl scale deployment/web --replicas=5
```

<div class="mt-3 text-sm" v-click="1">

Escalar muda **um número** — `spec.replicas`. O ReplicaSet adiciona ou remove
Pods até `status.replicas` bater. Você declara o *querer*; o loop o realiza —
nenhum Pod criado à mão.

</div>

  </div>
  <div v-click="2">

```yaml
metadata:
  labels:
    app.kubernetes.io/name: web
    app.kubernetes.io/version: "v1"
    app.kubernetes.io/component: frontend
```

<div class="mt-3 text-sm">

Os **labels recomendados** (`app.kubernetes.io/*`) são um vocabulário compartilhado
que toda ferramenta entende — dashboards, `kubectl get -l` e o selector do
Service na **próxima seção.**

</div>

  </div>
</div>

<div v-click="3" class="mt-5">
  <KwChip variant="ok">spec.replicas = desejado</KwChip>
  <KwChip>status.replicas = observado</KwChip>
  <KwChip variant="warn">o HPA escreve replicas por você</KwChip>
</div>

<!--
Speaker: duas ideias em um slide. (1) escalar é só editar o estado desejado — o
mesmo músculo de reconciliação, nenhum mecanismo novo. Spec vs status de novo
(do S03). (2) os labels recomendados são como o ecossistema combina os nomes;
eles também alimentam o selector do Service no S07, então é a ponte natural. Não
se demore — uma linha para cada. Note que o HPA depois automatiza o número de
réplicas.
-->

---
layout: recap
heading: 'Recap — você edita o desejo, o controller faz o trabalho'
next: 'Service — um endereço estável na frente desses Pods que não param de mudar'
---

- Um **Deployment** é dono de **ReplicaSets**, que são donos de **Pods**; você
  edita o Deployment e o loop de reconciliação faz o resto
- O `deployment.yaml` **envolve o `pod.yaml` sem alterações** dentro de
  `spec.template` — red line 2/5, e o Service do Lab 07 vai selecionar estes
  mesmos Pods `app: web`
- Uma nova image ⇒ um **novo ReplicaSet**; `maxSurge`/`maxUnavailable` mantêm a
  aplicação no ar durante o rollout, e o RS antigo fica em 0 para o
  `rollout undo` ser instantâneo
- **Escalar** é só editar `spec.replicas` — desejado vs observado, mais uma vez

<!--
Speaker: o beat emocional vira do "ele se foi" do S05 para "ele se cura, escala e
se atualiza sozinho." Mas aponte a lacuna que o S07 preenche: cada rollout mudou
os IPs dos Pods — clientes não conseguem perseguir um alvo em movimento. Isso é o
Service. Passe o bastão para o Lab 06; mantenha o deployment.yaml no disco, o
Lab 07 adiciona um Service ao lado dele.
-->

---
layout: lab
lab: labs/day-1/06-deployment.md
duration: 30 min
env: namespace ✓ / kind ✓
---

## Lab 06 — Rollouts & rollbacks

- Estenda o `pod.yaml` para `deployment.yaml`; observe **Deployment → ReplicaSet → 3 Pods**
- Delete um Pod — o ReplicaSet o cunha de novo; **escale** para 5 e de volta
- **Faça o rollout** de `workshop-web:v2`, observe dois ReplicaSets em rotatividade, leia o `rollout history`
- **Quebre:** role uma tag ruim → o rollout **estagna** enquanto os Pods antigos continuam servindo → `rollout undo`
- Guarde o `deployment.yaml` para o Lab 07.

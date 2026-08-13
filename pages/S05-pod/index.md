---
layout: section-cover
image: /covers/section-05-first-hatchling.webp
day: Day 1
section: '05'
tier: core
track: Core
---

# Pod

"Linha vermelha" 1/5 · A menor coisa que o Kubernetes executa — construa seu
manifesto, observe-o rodando, quebre-o de propósito.

**core** · sugerido para o Day 1 · trilha Core

<!--
Seção S05 — Pod. Tempo: ~30 min de slides + 25 min de lab.
Resultado: os participantes conseguem escrever, executar, inspecionar e deletar
um Pod, ler seu ciclo de vida e diagnosticar ImagePullBackOff.
Beats: problema (o K8s executa Pods, não containers) · modelo mental (contexto
compartilhado) · ciclo de vida (fases + restartPolicy) · magic-move do pod.yaml
canônico · executar + observar · init/sidecar/imagePullSecrets · quebrar
(ImagePullBackOff) · punchline da recapitulação levando ao Deployment. Sem
animação compartilhada. Image de demo: ghcr.io/platformrelay/workshop-web
(distroless, :8080) — o exec não tem shell, então o beat de inspeção ensina
kubectl debug.
Semente da red line: o pod.yaml construído aqui É o manifesto de
labs/day-1/05-pod — S06/S07/S08 estendem todos ele. CKx: CKAD Pod design &
lifecycle.
-->

---
layout: statement
kicker: O problema
---

Você entrega ao Kubernetes um **container** para executar… só que não.

A menor coisa que o scheduler coloca em um node é um **Pod** — um invólucro fino
em torno de um ou mais containers. Domine o Pod e todo workload que vier depois
(Deployment, StatefulSet, Job) é só uma máquina que **cria Pods por você**.

<!--
Speaker: este é o átomo sobre o qual todo o restante do curso se constrói.
Ninguém roda Pods avulsos em produção — mas tudo que RODA em produção, no fim
das contas, agenda Pods. Acerte isso e a red line se desenrola sozinha. O Lab 05
vem depois desta seção.
-->

---

<span class="kw-kicker">Modelo mental</span>

# Um Pod, um contexto compartilhado

<div class="kw-cols-2 mt-4">
  <KwCard heading="Containers que compartilham um contexto" kind="pod">
    Um Pod é <strong>um ou mais</strong> containers que sempre caem no
    <strong>mesmo node</strong> e compartilham um <strong>network namespace</strong>
    (um único IP de Pod; os containers se alcançam via <code>localhost</code>) e podem
    compartilhar <strong>volumes</strong>.
  </KwCard>
  <KwCard heading="A unidade de agendamento" icon="🧩" variant="plain">
    O scheduler posiciona um <strong>Pod inteiro</strong>, nunca um container isolado.
    Um Pod é criado, agendado e deletado <strong>atomicamente</strong> — seus
    containers vivem e morrem juntos naquele node.
  </KwCard>
</div>

<div v-click class="mt-5 kw-muted text-sm">

A maioria dos Pods tem **um** container. Recorra a um segundo apenas quando ele
precisar compartilhar a rede ou o filesystem do primeiro — um log shipper, um
proxy — o padrão **sidecar**, que veremos daqui a pouco.

</div>

<!--
Speaker: martele "mesmo node, rede compartilhada, volumes compartilhados". O
modelo mental errado clássico é "um Pod é uma VM pequena" — não é; é um contexto
de execução compartilhado para containers co-agendados. O padrão de um único
container mantém os primeiros manifestos simples.
-->

---
clicks: 3
---

<div class="kw-slide-dense">

<span class="kw-kicker">Ciclo de vida · O Pod `web` da Mina</span>

# Fases, e o que "restart" realmente significa

<div class="mt-2">
  <PodLifecycle :step="$clicks" />
</div>

<div class="kw-cols-2 mt-3 text-sm">
  <div v-click>

**Phase** (`status.phase`) é uma manchete grosseira:
`Pending → Running → Succeeded` / `Failed` — o detalhe vive nos statuses dos
containers e nos **Events**.

  </div>
  <div v-click>

**`restartPolicy`** reinicia o **container no lugar** — nunca o **Pod**.
Delete o objeto Pod e *nada* o traz de volta. Essa é a lacuna que o Deployment preenche.

  </div>
</div>

</div>

<!--
Speaker: avance clique a clique pela história da Mina — Pending durante o
agendamento/pull, Running quando Ready, um crash que incrementa RESTARTS mas
mantém o mesmo Pod, e então o delete sem nada recriá-lo. Três cliques chegam a
Deleted (`clicks: 3`); só os dois cards laterais `v-click` parariam a animação
em Running/restart. Prompt de imagem (arte de capa opcional): dark technical
slide, single Pod glyph moving through four states on a timeline, graphite
background, Kubernetes blue accent, no text in the image.

Speaker: trace a linha com força entre "container reiniciado" (o contador
RESTARTS sobe, mesmo Pod) e "Pod recriado" (trabalho de um controller — não de
um Pod). Essa distinção é a punchline inteira desta seção e a razão de o
Deployment existir. O stretch do Lab 05 executa um container que quebra de
propósito e observa RESTARTS subir enquanto o objeto Pod permanece.
-->

---
layout: code-walkthrough
heading: 'O Pod canônico — todo recurso da red line estende este'
lab: labs/day-1/05-pod.md
---

````md magic-move
```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # é assim que o Service do Lab 07 vai encontrar este Pod
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1   # uma tag real e fixada — nunca :latest
```

```yaml
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
        - containerPort: 8080   # documenta a porta; a aplicação precisa escutar nela
```

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels:
    app: web            # este label é como o Service do Lab 07 vai encontrar o Pod
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
      resources:        # um pequeno "stub de resources" — o Lab 13 expande isso em QoS
        requests:
          cpu: 50m
          memory: 64Mi
        limits:
          cpu: 250m
          memory: 128Mi
```
````

<!--
Speaker: construa campo a campo. apiVersion+kind (o quê) → metadata.name (quem) →
labels (a chave de junção que o Service usa depois) → containers (a carga útil) →
ports (documentação + alvo do Service) → resources (um stub, para que o QoS no
S13 seja um diff, não uma reescrita). ISTO é o asset-semente da red line: ele É o
pod.yaml de labs/day-1/05-pod, e o S06 o envolve em um template de Deployment sem
alterações. Não mantenha uma segunda cópia em lugar nenhum.
-->

---
layout: code-annotated
heading: 'Execute, depois leia'
lab: labs/day-1/05-pod.md
---

```bash {none|1|2|3|4}
kubectl apply -f pod.yaml
kubectl get pod web -w
kubectl describe pod web
kubectl debug -it web --image=busybox:1.37 --target=web
```

::notes::

<CodeNote at="1" label="apply">
Declarativo: você declara o objeto, o API server o armazena, o kubelet o torna
real. Reexecutar o <code>apply</code> converge — não duplica.
</CodeNote>

<CodeNote at="2" label="get -w">
<code>-w</code> transmite as mudanças ao vivo: <code>Pending → ContainerCreating →
Running</code>, <code>READY 0/1 → 1/1</code>.
</CodeNote>

<CodeNote at="3" label="describe" variant="ok">
O cavalo de batalha do debugging — sua seção <code>Events</code> guarda a verdade. Combine
com <code>kubectl logs web</code> para a saída da própria aplicação.
</CodeNote>

<CodeNote at="4" label="debug">
A image de demo é <strong>distroless</strong> — sem shell, então <code>kubectl exec … sh</code>
falha. O <code>debug</code> anexa um <strong>ephemeral container</strong> com uma toolbox
image; <code>--target</code> compartilha o PID namespace da aplicação. No Lab 05 você confirma que o
servidor é o PID 1.
</CodeNote>

<!--
Speaker: estes cinco comandos são o kit de debugging inteiro para o resto do
workshop — get/describe/logs/exec/debug voltam em toda seção. Enfatize
describe → Events como reflexo, e que o exec falhar numa image distroless é
um recurso (menor superfície de ataque), não um bug — debug é a resposta moderna.
Tudo aqui é exatamente o Lab 05, passo a passo.
-->

---

<span class="kw-kicker">Além de um container</span>

# Init, sidecars e pull de images privadas

<div class="kw-cols-3 mt-4">
  <v-click at="1">
    <KwCard heading="initContainers" icon="⏳">
      Rodam até completar <strong>antes</strong> de os containers de aplicação iniciarem, em ordem —
      esperar uma dependência, rodar uma migração. Se um falha, o Pod tenta de novo.
    </KwCard>
  </v-click>
  <v-click at="2">
    <KwCard heading="Sidecars nativos" icon="🤝">
      Um <code>initContainer</code> com <code>restartPolicy: Always</code> —
      a forma estável de rodar um auxiliar (log shipper, proxy) durante toda a vida
      do Pod, iniciado antes da aplicação.
    </KwCard>
  </v-click>
  <v-click at="3">
    <KwCard heading="imagePullSecrets" kind="secret" variant="plain">
      Nomeia um Secret com credenciais de registry para que o kubelet consiga fazer pull de um
      registry <strong>privado</strong>. Images públicas (como a image de demo do
      workshop) não precisam de nenhum.
    </KwCard>
  </v-click>
</div>

<div v-click class="mt-5 kw-muted text-sm">

Repare no que um Pod **não** consegue fazer: se curar, escalar ou fazer rollout de uma nova versão.
Um Pod avulso é uma ferramenta didática — workloads reais pertencem a um controller. Esse é o
**Deployment, a seguir.**

</div>

<!--
Speaker: "sidecars nativos" (init container com restartPolicy:Always) são
estáveis e a melhor prática atual — mencione que o velho hack do segundo
container avulso foi superado. Feche o ponto com força: as limitações do Pod SÃO
o argumento para o Deployment. Não estique o detalhe de init/sidecar — uma linha
para cada, o assunto volta depois.
-->

---
layout: code-annotated
heading: 'Quebre de propósito — a falha de Pod nº 1'
lab: labs/day-1/05-pod.md
---

```bash {none|1|2|3}
kubectl run web-typo --image=ghcr.io/platformrelay/workshop-web:v9.99-nope --restart=Never
kubectl get pod web-typo
kubectl describe pod web-typo | sed -n '/Events:/,$p'
```

::notes::

<CodeNote at="1" label="uma tag que não existe">
<code>v9.99-nope</code> nunca foi publicada no registry. O Pod é aceito e
<em>agendado</em> — a falha vem depois, na hora do pull.
</CodeNote>

<CodeNote at="2" label="ImagePullBackOff" variant="warn">
O <code>STATUS</code> mostra <code>ImagePullBackOff</code>: o kubelet tentou,
falhou, e está recuando antes de tentar de novo. Uma palavra de status, não uma razão.
</CodeNote>

<CodeNote at="3" label="a resposta de verdade" variant="danger">
Os <code>Events</code> soletram: <code>Failed to pull image … manifest not
found</code>. <strong>O status diz que algo está errado; os Events dizem o quê.</strong>
</CodeNote>

<!--
Speaker: esta é A falha que todo mundo encontra primeiro, então torne-a familiar
agora. O ponto de ensino não é o conserto (delete + corrija a tag) — é o
reflexo: status ruim → leia os Events. O Lab 05 faz os participantes viverem
isso na prática e consertarem.
-->

---
layout: recap
heading: 'Recap — o Pod que você deleta continua deletado'
story: 'Mina consertou o crash, mas deletar o `web` ainda deixou a aplicação fora do ar — nenhum controller estava observando.'
next: 'Deployment — um controller que mantém seu Pod vivo'
---

- Um Pod é o **átomo do agendamento**: containers co-agendados compartilhando rede
  e volumes — normalmente só um container
- `restartPolicy` reinicia um **container**; nada reinicia um **Pod deletado**
- `pod.yaml` é a **semente da red line** — o Deployment o envolve em um template
  sem alterações, e o Service e o Ingress constroem sobre isso
- Leia falhas sempre do mesmo jeito: **status → `describe` → Events**

<!--
Speaker: o beat emocional é "delete o Pod e ele se foi — nenhuma mágica o traz
de volta". Essa lacuna é exatamente o que um Deployment preenche. Passe o bastão
para o Lab 05 agora: eles executam cada comando destes slides e terminam na
mesma punchline. Mantenha o pod.yaml no disco — o Lab 06 o abre.
-->

---
layout: lab
lab: labs/day-1/05-pod.md
duration: 25 min
env: namespace ✓ / kind ✓
---

## Lab 05 — Seu primeiro Pod

- Aplique o `pod.yaml`, observe `Pending → Running`, confirme `READY 1/1`
- Inspecione de três formas: `describe` (Events), `logs`, `debug` (o servidor é o PID 1)
- **Quebre:** uma tag de image que não existe → `ImagePullBackOff`; diagnostique pelos Events
- **A punchline:** delete o Pod — nada o recria. Guarde o `pod.yaml` para o Lab 06.

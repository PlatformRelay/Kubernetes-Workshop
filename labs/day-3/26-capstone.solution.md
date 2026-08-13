# Lab 26 — Capstone de best practices (S26) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 0 — um namespace e o checklist contra o qual você audita

```bash
export NS=s26
kubectl create namespace "$NS"
kubectl config set-context --current --namespace="$NS"
```

Escreva o checklist para guardar — este é o **artefato de repositório** dos slides.

```bash
cat > PRODUCTION-CHECKLIST.md <<'EOF'
# Production-readiness checklist

## Availability
- [ ] Probes: readiness (gate traffic), liveness (restart wedged), startup (slow boot)   [S14]
- [ ] Resources: requests (reserve) + limits (cap)                                        [S13]
- [ ] PodDisruptionBudget: keep minAvailable up through voluntary disruptions             [availability]
- [ ] Anti-affinity / topologySpreadConstraints: replicas across nodes                    [availability]
- [ ] Rollout strategy + revisionHistoryLimit                                             [S06]
- [ ] More than one replica                                                               [availability]

## Security
- [ ] Recommended labels: app.kubernetes.io/{name,instance,version,part-of,managed-by}    [hygiene]
- [ ] Immutable image digest (@sha256:…), not a movable tag                               [S02]
- [ ] Restricted securityContext: runAsNonRoot, no priv-esc, drop ALL, seccomp            [S17]
- [ ] NetworkPolicy: default-deny, then explicit allow                                    [S18]
- [ ] Config/secret hygiene: externalized, least privilege                                [S11/S12]

## Operations
- [ ] GitOps delivery: manifest in Git, agent reconciles                                  [S21]
- [ ] Observability: /metrics + a ServiceMonitor selecting by label                       [S23]
- [ ] Graceful shutdown: terminationGracePeriodSeconds + preStop                          [graceful shutdown]
- [ ] Cost: right-size requests to real usage                                             [cost]
EOF

cat PRODUCTION-CHECKLIST.md
```

**Tarefa:** confirme que o checklist foi escrito — você vai marcando cada item conforme corrige o manifesto.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl create namespace "$NS"
namespace/s26 created
```

O checklist tem três grupos — **availability**, **security**, **operations** — e cada linha remete à
seção que a ensinou. Este é o entregável da seção: um `PRODUCTION-CHECKLIST.md` que você commita ao
lado dos seus manifestos e contra o qual revisa cada mudança. No resto do lab, cada correção marca uma
caixa.

</details>

---

### Step 1 — leia o manifesto falho e audite você mesmo

Escreva o Deployment falho. **Leia-o antes de ler o gabarito.**

```bash
cat > flawed-deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
EOF

cat flawed-deployment.yaml
```

**Tarefa:** audite este manifesto contra o `PRODUCTION-CHECKLIST.md`. **Anote todos os problemas que
encontrar** antes de abrir o spoiler. Mire em dez.

<details><summary>Gabarito — os problemas plantados (~10)</summary>

Cada problema mapeia para uma linha do checklist e para a seção que a ensinou. Oito estão **dentro**
do Deployment; dois são **objetos irmãos ausentes**.

| # | Problema | Correção | Vem de |
| --- | --- | --- | --- |
| 1 | **Sem probes de liveness/readiness/startup** | adicione as três (`httpGet` nos `/ready` + `/healthz` da app, porta 8080) | S14 |
| 2 | **Sem requests/limits de resources** (BestEffort — primeiro a ser despejado) | adicione `requests` + `limits` | S13 |
| 3 | **Sem `securityContext`** (roda com o usuário padrão, capabilities completas, sem seccomp) | `runAsNonRoot` + `runAsUser: 65532` + `seccompProfile` + `allowPrivilegeEscalation: false` + `drop: [ALL]` | S17 |
| 4 | **Sem PodDisruptionBudget** — um drain pode zerar tudo | adicione um PDB, `minAvailable: 2` | availability |
| 5 | **Tag de image mutável** (`:v1`, sem digest) — os bytes em execução podem mudar | fixe por digest `@sha256:…` | S02 |
| 6 | **Sem NetworkPolicy** — rede plana, um ponto de apoio circula à vontade | default-deny + um allow | S18 |
| 7 | **Sem graceful shutdown** — conexões derrubadas durante o rollout | `terminationGracePeriodSeconds` + `preStop` | graceful shutdown |
| 8 | **Faltam os labels recomendados** (só o `app: web` ad-hoc) | adicione `app.kubernetes.io/*` | hygiene |
| 9 | **`replicas: 1`** — sem HA e sem spread | `replicas: 3` + `topologySpreadConstraints` | availability |
| 10 | **Sem strategy de rollout / `revisionHistoryLimit`** — ReplicaSets mortos se acumulam, surge descontrolado | `RollingUpdate` (`maxUnavailable: 0`) + `revisionHistoryLimit` | S06 / cost |

Linha bônus que você não enxerga no YAML mas que pertence ao checklist: **higiene de config/secret**
(S11/S12) — este Pod não tem config, mas um real mantém a config em um `ConfigMap`/`Secret`, nunca
embutida — e **observability** (S23): exponha `/metrics` e um `ServiceMonitor`. Anotamos as duas; a
correção abaixo cobre os dez problemas visíveis no manifesto.

</details>

> **Por que auditar antes de revelar.** A habilidade profissional que este capstone constrói é *ler um
> manifesto contra um checklist* — enxergar as omissões. No trabalho ninguém te entrega um gabarito; o
> checklist é o gabarito. Faça a auditoria no frio e só depois compare.

**Pergunta:** o manifesto falho **aplica sem erro** com `kubectl apply` em um namespace padrão —
então por que ele está "errado"?

<details><summary>Resposta</summary>

Porque **YAML válido e um Pod em execução não são a mesma coisa que production-ready.** O `kubectl
apply` aceita o manifesto e um Pod sobe `Running` — mas `Running` só significa que o processo iniciou
(S14), o Pod é BestEffort e o primeiro a ser despejado (S13), ele roda com privilégios padrão (S17), a
falha de um único node é uma indisponibilidade total (uma réplica, sem spread, sem PDB), a image pode
mudar debaixo de você (uma tag pura, sem digest) e
nada o isola na rede (S18). O checklist existe justamente porque a régua do API server
("isto é válido?") está muito abaixo da régua de produção ("isto vai ficar no ar, resistir a
comprometimento e ser operável?"). Os próximos passos fecham essa lacuna.

</details>

---

### Step 2 — corrija: o Deployment endurecido (uma correção por problema)

Escreva o Deployment corrigido. Cada campo abaixo fecha exatamente um item da auditoria.

```bash
cat > fixed-deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app.kubernetes.io/name: web            # ⑧ labels recomendados (higiene)
    app.kubernetes.io/instance: web
    app.kubernetes.io/version: "v1"
    app.kubernetes.io/part-of: workshop
    app.kubernetes.io/managed-by: argocd
spec:
  replicas: 3                              # ⑨ HA — mais de uma réplica
  revisionHistoryLimit: 5                  # ⑩ poda ReplicaSets antigos
  strategy:                                # ⑩ rollout controlado
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 1
  selector:
    matchLabels:
      app.kubernetes.io/name: web
  template:
    metadata:
      labels:
        app.kubernetes.io/name: web        # casa com os selectors do PDB / topologySpread / NetworkPolicy
        app.kubernetes.io/instance: web
        app.kubernetes.io/version: "v1"
        app.kubernetes.io/part-of: workshop
        app.kubernetes.io/managed-by: argocd
    spec:
      terminationGracePeriodSeconds: 30    # ⑦ graceful shutdown (janela de graça)
      securityContext:                     # ③ restricted — campos no nível do pod
        runAsNonRoot: true
        runAsUser: 65532                   # o UID non-root embutido na image (distroless nonroot)
        seccompProfile:
          type: RuntimeDefault
      topologySpreadConstraints:           # ⑨ espalha as réplicas entre os nodes
        - maxSkew: 1
          topologyKey: kubernetes.io/hostname
          # DoNotSchedule deixa réplicas presas em um cluster de um node só (veja a nota); use
          # ScheduleAnyway se for rodar isto de verdade em um kind de 1 node
          whenUnsatisfiable: DoNotSchedule
          labelSelector:
            matchLabels:
              app.kubernetes.io/name: web
      containers:
        - name: web
          # ⑤ fixe por digest — valor fictício; RESOLVA no ensaio (veja a nota abaixo deste bloco)
          image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
          ports:
            - containerPort: 8080
          resources:                       # ② requests + limits (dimensionados, S13/custo)
            requests: { cpu: 50m, memory: 64Mi }
            limits:   { cpu: 200m, memory: 128Mi }
          readinessProbe:                  # ① probes (S14) — os endpoints da própria app
            httpGet: { path: /ready, port: 8080 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 3
            failureThreshold: 30
          securityContext:                 # ③ restricted — campos no nível do container
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          lifecycle:                        # ⑦ graceful shutdown — drena antes do SIGTERM
            preStop:
              sleep: { seconds: 5 }        # sleep action nativo — sem shell na image (distroless)
EOF

cat fixed-deployment.yaml
```

Agora os dois **objetos irmãos** — um PDB e uma NetworkPolicy (⑤ ④ ⑥). Eles selecionam o mesmo
label `app.kubernetes.io/name: web`, e é por isso que corrigir os labels primeiro importava.

```bash
cat > fixed-pdb.yaml <<'EOF'
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
  labels:
    app.kubernetes.io/name: web
spec:
  minAvailable: 2                          # ④ mantém ≥2 no ar durante disruptions voluntárias
  selector:
    matchLabels:
      app.kubernetes.io/name: web
EOF

cat > fixed-netpol.yaml <<'EOF'
# ⑥ default-deny de ingress para os Pods web, depois um allow explícito
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-default-deny
  labels:
    app.kubernetes.io/name: web
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: web
  policyTypes:
    - Ingress                              # sem regras de ingress → nega toda entrada
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-ingress
  labels:
    app.kubernetes.io/name: web
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/name: web
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app.kubernetes.io/part-of: workshop   # só chamadores de dentro da app
      ports:
        - protocol: TCP
          port: 8080
EOF
```

**Tarefa:** confirme que cada um dos dez problemas agora tem exatamente uma correção nos arquivos acima.

<details><summary>Solução — mapa problema → correção</summary>

```text
① probes .............. readiness /ready + liveness/startup /healthz (port 8080)    [fixed-deployment.yaml]
② resources ........... resources.requests + resources.limits                       [fixed-deployment.yaml]
③ securityContext ..... pod: runAsNonRoot/runAsUser:65532/seccomp ·
                        container: allowPrivilegeEscalation:false/drop ALL           [fixed-deployment.yaml]
④ PDB ................. minAvailable: 2                                              [fixed-pdb.yaml]
⑤ digest .............. image ...@sha256:0000…0000 (dummy → resolve at rehearsal)   [fixed-deployment.yaml]
⑥ NetworkPolicy ....... default-deny + allow (podSelector on our label)             [fixed-netpol.yaml]
⑦ graceful shutdown ... terminationGracePeriodSeconds: 30 + preStop sleep 5         [fixed-deployment.yaml]
⑧ labels .............. app.kubernetes.io/{name,instance,version,part-of,managed-by} [fixed-deployment.yaml]
⑨ HA + spread ......... replicas: 3 + topologySpreadConstraints                     [fixed-deployment.yaml]
⑩ rollout ............. strategy RollingUpdate(maxUnavailable:0) + revisionHistoryLimit [fixed-deployment.yaml]
```

**Uma correção por problema** — nada agrupado, nada esquecido. Repare na **divisão** pod/container no
③: os campos do `restricted` válidos no escopo do pod (`runAsNonRoot`, `runAsUser`, `seccompProfile`)
ficam em `spec.template.spec.securityContext`; os campos exclusivos de container
(`allowPrivilegeEscalation`, `capabilities.drop`) ficam no container. E repare que todo selector irmão
se apoia no **mesmo** label `app.kubernetes.io/name: web` — o PDB, o topology spread e a NetworkPolicy
miram nele, e é por isso que a correção dos labels (⑧) é pré-requisito para as outras se ligarem.

</details>

> **⚠️ Resolva o digest antes de depender dele.** `@sha256:0000…0000` é um digest **fictício** —
> de *sintaxe* válida (64 caracteres hex), mas não é uma image real. Um dry-run server-side (Step 3)
> roda o **admission sem fazer pull da image**, então o valor fictício ainda prova a *conformidade com
> restricted*. Mas um `kubectl apply` de verdade vai parar em **`ImagePullBackOff`** até você trocar
> pelo digest real:
>
> ```bash
> # resolva o digest real da tag, depois edite a linha da image:
> crane digest ghcr.io/platformrelay/workshop-web:v1
> # ou: docker buildx imagetools inspect ghcr.io/platformrelay/workshop-web:v1
> # → image: ghcr.io/platformrelay/workshop-web:v1@sha256:<o digest real>
> ```

> **⚠️ `topologySpreadConstraints` em um cluster de um node só.** Com `whenUnsatisfiable:
> DoNotSchedule` e `replicas: 3`, apenas **um** Pod é agendado em um cluster kind de um node — os
> outros dois ficam em `Pending` (não dá para espalhar três Pods por um node só). Esse é o
> comportamento correto e estrito. Se você rodar isto de verdade em um kind de um node e quiser os
> três no ar, troque para `ScheduleAnyway` (spread best-effort) ou adicione worker nodes. A validação
> de admission abaixo não é afetada — ela nunca agenda nada.

---

### Step 3 — valide: dry-run do conjunto e prove que o `restricted` admite o Pod corrigido

Primeiro um **dry-run server-side** de todo o conjunto corrigido — ele roda o admission completo
(schema + policy) **sem** criar nada e sem fazer pull da image. Isso confirma que os objetos estão
bem formados.

```bash
kubectl apply --dry-run=server -f fixed-deployment.yaml -f fixed-pdb.yaml -f fixed-netpol.yaml
```

Agora o teste restricted — e aqui está uma armadilha que o capstone existe para ensinar. **O
`enforce` do PSA barra *Pods*, não objetos de workload.** Aplicar um *Deployment* sob
`enforce=restricted` é aceito; a rejeição acontece depois, quando o controller de ReplicaSet tenta
criar os *Pods* — o que o `--dry-run=server` nunca executa. Então, para ver o admission rejeitar as
violações de segurança diretamente, submetemos o **Pod template como um Pod avulso**. (É exatamente
por isso que o `enforce` sozinho não é um gate completo — mais sobre isso na pergunta abaixo.)

```bash
kubectl label --overwrite namespace "$NS" \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/warn=restricted

# extraia o Pod template de cada Deployment como um Pod avulso e faça dry-run contra enforce=restricted
# (só os campos ligados ao securityContext importam para o admission; o spec completo está nos *-deployment.yaml)
cat > flawed-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app: web }
spec:
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1
      ports:
        - containerPort: 8080
EOF

cat > fixed-pod.yaml <<'EOF'
apiVersion: v1
kind: Pod
metadata:
  name: web
  labels: { app.kubernetes.io/name: web }
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 65532
    seccompProfile: { type: RuntimeDefault }
  containers:
    - name: web
      image: ghcr.io/platformrelay/workshop-web:v1@sha256:0000000000000000000000000000000000000000000000000000000000000000
      ports:
        - containerPort: 8080
      securityContext:
        allowPrivilegeEscalation: false
        capabilities: { drop: ["ALL"] }
EOF

echo "== flawed Pod (expect REJECTED) =="
kubectl apply --dry-run=server -f flawed-pod.yaml

echo "== fixed Pod (expect ADMITTED) =="
kubectl apply --dry-run=server -f fixed-pod.yaml
```

**Tarefa:** o Pod falho é **rejeitado** pelas quatro violações do `restricted`; o Pod corrigido é
**admitido**. Leia as duas saídas.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply --dry-run=server -f fixed-deployment.yaml -f fixed-pdb.yaml -f fixed-netpol.yaml
deployment.apps/web created (server dry run)
poddisruptionbudget.policy/web created (server dry run)
networkpolicy.networking.k8s.io/web-default-deny created (server dry run)
networkpolicy.networking.k8s.io/web-allow-ingress created (server dry run)

== flawed Pod (expect REJECTED) ==
$ kubectl apply --dry-run=server -f flawed-pod.yaml
Error from server (Forbidden): error when creating "flawed-pod.yaml": pods "web" is forbidden:
violates PodSecurity "restricted:latest": allowPrivilegeEscalation != false (container "web" must set
securityContext.allowPrivilegeEscalation=false), unrestricted capabilities (container "web" must set
securityContext.capabilities.drop=["ALL"]), runAsNonRoot != true (pod or container "web" must set
securityContext.runAsNonRoot=true), seccompProfile (pod or container "web" must set
securityContext.seccompProfile.type to "RuntimeDefault" or "Localhost")

== fixed Pod (expect ADMITTED) ==
$ kubectl apply --dry-run=server -f fixed-pod.yaml
pod/web created (server dry run)
```

O Pod **falho** esbarra nos **quatro** campos do `restricted` — exatamente os mesmos quatro gates do
S17. O Pod **corrigido** define os quatro (divididos entre pod e container) e é **admitido**. O
`--dry-run=server` rodou os admission controllers de verdade, então `created (server dry run)`
significa *isto seria aceito* — mas nada foi realmente criado. Mesmo namespace, mesmo label
`enforce=restricted`; só o manifesto mudou. (Você também pode confirmar o caminho do **Deployment**:
aplique o Deployment falho de verdade sob `enforce=restricted` e o `kubectl describe rs` mostra
`FailedCreate … pods "web-…" is forbidden …` — o Deployment existe, os Pods dele não.)

</details>

> **⚠️ Por que o Pod avulso, e por que isso importa.** O modo `enforce` avalia **Pods**, não
> Deployments, ReplicaSets ou Jobs. Aplique um *Deployment* violador sob `enforce=restricted` e ele é
> **criado** — o bloqueio só aparece quando o controller de ReplicaSet tenta criar Pods, como um
> event `FailedCreate`, não como erro do `apply`. O `--dry-run=server` não executa controllers, então
> nunca consegue mostrar isso. Fazemos o dry-run do Pod template diretamente para ver o gate disparar.
> Os modos `warn`/`audit` *de fato* inspecionam o template embutido no objeto de workload (é o
> Stretch) — mas só o `enforce` bloqueia, e só em Pods.

> **⚠️ Admitido no dry-run ≠ em execução.** O admission checa o YAML, não a image. O digest fictício
> (`@sha256:0000…0000`) satisfaz o admission, mas um `kubectl apply` real do Deployment corrigido vai
> ser *admitido* e depois cair em **`ImagePullBackOff`** — resolva o digest antes (nota do Step 2).
> Este lab foi validado para **admission**; uma execução completa até Running exige o digest real, um
> CNI que aplique policies para a NetworkPolicy e (para o spread de 3 réplicas) um cluster
> **multi-node** — veja a nota no Step 2.

**Pergunta:** você precisou submeter um **Pod** avulso para ver o `enforce` rejeitar os campos de
segurança. Então o `enforce=restricted` no namespace torna o manifesto corrigido production-ready?

<details><summary>Resposta</summary>

**Não — por dois motivos.** Primeiro, o `enforce` só barra **Pods**, e só checa os **quatro** campos
do `securityContext`; um Deployment com `replicas: 1`, sem probes, com uma tag não fixada e sem
NetworkPolicy passa liso, desde que o `securityContext` do seu Pod template esteja correto. Segundo, o
admission é uma *única linha* do checklist — o piso de segurança — imposta **para** você. Ele não sabe
nem se importa se você fixou um digest, adicionou os labels recomendados, escreveu um
PodDisruptionBudget, definiu probes/resources ou aplicou uma NetworkPolicy. Isso é **disciplina de
review** — que é exatamente o motivo de você commitar o `PRODUCTION-CHECKLIST.md` e barrá-lo no
CI/GitOps (S21), em vez de confiar que o API server vai pegar tudo.

</details>

---

### Step 4 — classifique cada correção: availability vs security vs cost

**Tarefa:** separe as dez correções em **availability**, **security** e **cost**, e decida quais
importam mais para *este* workload (um web front end stateless).

<details><summary>Resposta</summary>

| Correção | Categoria | Por quê |
| --- | --- | --- |
| Probes (①) | **Availability** | readiness mantém o tráfego longe de Pods não prontos; liveness se auto-cura |
| Resources — requests (②) | **Availability** + **Cost** | requests agendam *e* reservam (custo); um limit evita um vizinho barulhento |
| PDB (④) | **Availability** | mantém ≥2 no ar durante drains/upgrades |
| Rollout + `revisionHistoryLimit` (⑩) | **Availability** + **Cost** | `maxUnavailable:0` = nenhuma queda de capacidade; o limite de histórico poda RSs mortos (custo) |
| Réplicas + spread (⑨) | **Availability** | sobreviver à falha de um node |
| Labels (⑧) | **Security**/higiene | selectors, dashboards e GitOps dependem deles |
| Pin por digest (⑤) | **Security** | proveniência — os bytes em execução são os bytes escaneados |
| `securityContext` (③) | **Security** | menor privilégio; encolhe o raio de explosão |
| NetworkPolicy (⑥) | **Security** | contém um ponto de apoio em uma rede plana |
| Graceful shutdown (⑦) | **Availability** | zero conexões derrubadas em rollout/scale-down |

**Mais importante para *este* workload** — um **web front end stateless, replicado e exposto à
internet**: o conjunto de **availability** pesa mais no dia a dia (probes, >1 réplica + spread, PDB,
graceful shutdown), porque a falha que você realmente vai encontrar é um rollout ou um drain de node,
não um atacante direcionado. Mas o **piso de segurança** (`securityContext` — ③) é inegociável e
*grátis*: é a única linha pela qual o admission `restricted` vai te rejeitar, e não custa nada
configurar. **Cost** importa menos aqui só porque o workload é minúsculo — dimensionar corretamente os
requests (②) é onde isso morde em escala. Um workload diferente (um banco de dados, um batch job, um
Pod que lida com secrets) reequilibraria esta tabela — e esse é o ponto: o checklist é universal, as
**prioridades são por workload**.

</details>

---

### Step 5 — confirme a cobertura completa do checklist

**Tarefa:** percorra o `PRODUCTION-CHECKLIST.md` linha a linha contra os manifestos corrigidos e marque
cada caixa.

<details><summary>Solução — mapa de cobertura</summary>

```text
AVAILABILITY
[x] Probes ....................... readiness + liveness + startup on :8080     (①)
[x] Resources .................... requests + limits                          (②)
[x] PDB .......................... fixed-pdb.yaml, minAvailable: 2            (④)
[x] Anti-affinity/spread ......... topologySpreadConstraints (hostname)      (⑨)
[x] Rollout + revisionHistory .... RollingUpdate maxUnavailable:0 + limit:5  (⑩)
[x] >1 replica ................... replicas: 3                               (⑨)

SECURITY
[x] Recommended labels ........... app.kubernetes.io/{name,…}                (⑧)
[x] Image digest ................. @sha256:… (placeholder → resolve)         (⑤)
[x] Restricted securityContext ... 4 fields, pod+container split            (③)
[x] NetworkPolicy ................ default-deny + allow                      (⑥)
[~] Config/secret hygiene ........ N/A here — no config; keep it externalized in real apps [S11/S12]

OPERATIONS
[~] GitOps ....................... managed-by: argocd label declares intent; wire the Application  [S21]
[~] Observability ................ add /metrics + a ServiceMonitor selecting app.kubernetes.io/name: web [S23]
[x] Graceful shutdown ............ terminationGracePeriodSeconds + preStop   (⑦)
[x] Cost ......................... right-sized requests (50m/64Mi)           (②)
```

**Todos os dez problemas visíveis no manifesto estão corrigidos.** As linhas `[~]` são itens do
checklist que este workload mínimo não exercita dentro do manifesto, mas que um serviço real precisa
endereçar: higiene de config/secret (S11/S12), a `Application` de GitOps que reconcilia este
repositório (S21 — o label `managed-by: argocd` declara a intenção) e um `ServiceMonitor` para
observability (S23). O manifesto do capstone é production-ready para o seu escopo, e o checklist nomeia
exatamente o que falta para um serviço mais completo.

</details>

## Stretch (opcional) — torne o checklist impossível de pular

O ponto final dos slides: transforme linhas do checklist em **gates automatizados** para que ninguém
as pule sob pressão de prazo. Prove um gate com as ferramentas que você já tem — o
`enforce=restricted` bloqueia a linha de segurança no admission (você acabou de ver). Para um segundo
gate, experimente o `warn` em um namespace novo, de modo que um Deployment fora de conformidade seja
**criado, mas sinalizado**, espelhando um check leve de CI.

```bash
kubectl create namespace s26-warn
kubectl label namespace s26-warn pod-security.kubernetes.io/warn=restricted
kubectl apply -n s26-warn -f flawed-deployment.yaml
kubectl get deploy web -n s26-warn
```

<details><summary>O que você está vendo</summary>

```console
$ kubectl apply -n s26-warn -f flawed-deployment.yaml
Warning: would violate PodSecurity "restricted:latest": allowPrivilegeEscalation != false, ...
runAsNonRoot != true, seccompProfile (...)
deployment.apps/web created

$ kubectl get deploy web -n s26-warn
NAME   READY   UP-TO-DATE   AVAILABLE   AGE
web    1/1     1            1           5s
```

Sob **`warn`**, o API server devolve a lista de violações como um **`Warning:`**, mas **cria** o
Deployment — e note que aqui ele inspeciona o Pod **template** embutido (diferente do `enforce`, que
só barra os Pods em si). Ele chega a `1/1`: a tag `:v1` do Deployment falho faz pull sem problema e
ele não tem probes, então o Pod fica Ready no instante em que inicia — um workload sinalizado por
segurança servindo tráfego tranquilamente é exatamente a situação que o `warn` existe para revelar sem
quebrar ninguém. Isso é descoberta, não bloqueio — como um check de CI não bloqueante que anota um PR.
A jogada real de migração é `warn`/`audit` primeiro (encontrar os infratores), corrigi-los, **depois**
`enforce`. Limpeza: `kind delete cluster` (descartável) ou remova o Namespace out-of-band.

</details>

> **⚠️ O stretch mais profundo é o artefato, não o comando.** Além do admission, os gates reais são:
> um policy engine (exigir labels/resources/probes), um linter no CI e um sync GitOps que só aplica
> manifestos revisados (S21). O ponto do capstone é que o `PRODUCTION-CHECKLIST.md` vire um conjunto de
> checks aplicados, e não um documento que as pessoas pretendem ler. Esse é o hábito para levar daqui.

## Expected state / output

- **Válido ≠ pronto.** O Deployment falho aplica sem erro e roda — e ainda assim falha uma dúzia de
  linhas do checklist: BestEffort, sem probes, privilégios padrão, uma réplica, uma tag não fixada,
  nenhum isolamento.
- **Uma correção por linha.** Cada um dos dez problemas mapeia para exatamente um campo ou objeto;
  nada agrupado.
- **Os selectors convergem para um label.** O PDB, o topology spread e a NetworkPolicy selecionam
  todos `app.kubernetes.io/name: web` — corrigir os labels primeiro é o que permite que o resto se
  ligue.
- **O `restricted` admite o Deployment corrigido e rejeita o falho** — os mesmos quatro gates do S17,
  provados por `--dry-run=server` em um namespace com `enforce=restricted`.
- **Admission é uma linha, não o checklist.** Ele impõe o piso de segurança; labels, digest, PDB,
  NetworkPolicy, HA e o dimensionamento correto são disciplina de review — por isso o checklist é
  entregue como artefato de repositório e barrado no CI/GitOps.

Status representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de RBAC,
histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

O sucesso do apply significa apenas que a API aceitou o schema do objeto e os plugins de
admission atuais — não que o workload atenda à production readiness. O restricted impõe o piso de
segurança no admission; itens de availability e de custo seguem sendo disciplina de review/CI, e essa
é a causa de o checklist ser o artefato do capstone.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de corrigir o
campo quebrado, ou faça o delete apenas dos objetos com label listados em Cleanup / reset e reinicie o
guided task. Prefira os Events de `kubectl describe` a chutar. Não rode deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl label --overwrite namespace "$NS" pod-security.kubernetes.io/enforce=restricted
kubectl apply -f flawed-deployment.yaml --dry-run=server 2>&1 | head -30
kubectl apply -f fixed-deployment.yaml --dry-run=server
kubectl apply -f fixed-pdb.yaml -f fixed-netpol.yaml --dry-run=server
```

### Expected state / output

O dry-run do falho falha (ou avisa/rejeita) sob restricted; o dry-run do Deployment/PDB/NetPol
corrigido tem sucesso. Suas anotações nomeiam ≥3 lacunas do checklist com labels de
availability/security ligadas a fields reais (probes, requests/limits, securityContext, replicas,
NetworkPolicy, etc.).

### Explanation

O sucesso do apply significa apenas que a API aceitou o schema do objeto e os plugins de
admission atuais — não que o workload atenda à production readiness. O restricted impõe o piso de
segurança no admission; itens de availability e de custo seguem sendo disciplina de review/CI, e essa
é a causa de o checklist ser o artefato do capstone.

### Hints

Use kubectl apply --dry-run=server -f flawed-deployment.yaml em um namespace
restricted; compare com o fixed-deployment.yaml; mantenha o PRODUCTION-CHECKLIST.md aberto enquanto
classifica.

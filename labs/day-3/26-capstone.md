# Lab 26 — Capstone de best practices (S26)

<!-- lab-contract:v1 -->

> **Este é o capstone do curso.** Você recebe um conjunto de manifestos deliberadamente **falho** e um
> **checklist de production-readiness**. Audite o manifesto contra o checklist, corrija cada problema e
> prove que o resultado seria admitido por um namespace `restricted`. Nenhum conceito novo — isto
> amarra S02, S13, S14, S17, S18, S21 e S23.

| | |
| --- | --- |
| **Section** | S26 — Best practices (capstone) |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 40 min |

## Objective

Transformar um Deployment `web` falho em um pronto para produção, **uma linha de checklist por
correção**. Você vai:

1. **Auto-auditar** o manifesto falho — liste todos os problemas *antes* de revelar o gabarito (~10 problemas).
2. **Corrigir cada problema** — probes, resources, `securityContext` restricted, um PodDisruptionBudget,
   um pin por digest, uma NetworkPolicy, graceful shutdown, labels recomendados, HA + topology spread.
3. **Validar** o conjunto corrigido com `kubectl apply --dry-run=server`, depois confirmar que um
   namespace `restricted` **admite** o Deployment corrigido.
4. **Classificar** cada correção como **availability**, **security** ou **cost** — e confirmar que os
   manifestos corrigidos cobrem o checklist inteiro.

O lab inteiro gira em torno de uma ideia: tudo o que você aprendeu neste curso é **uma lista que você
roda contra todo manifesto** — e um único Deployment sem hardening falha uma dúzia de linhas dela de
uma vez.

## Prerequisites

- Um cluster onde você possa criar um namespace e (para o teste restricted) aplicar labels nele — um
  cluster **kind** ou um namespace atribuído em um cluster compartilhado funcionam.
- `kubectl` configurado. O Pod Security Admission é **embutido no API server** (estável desde a v1.25).
- Acesso de pull à internet para `ghcr.io/platformrelay/workshop-web:v1` — a image de demonstração do
  workshop, distroless e non-root (UID **65532**), escutando na **8080** (por isso ela realmente roda
  sob `restricted`, diferente de uma image que sobe como root).
- **Nenhum cluster-admin necessário.** Tudo é escopado ao namespace.

## Files used

- `flawed-deployment.yaml` — o Deployment `web` sem hardening. Falha na maior parte do checklist.
- `fixed-deployment.yaml` — o Deployment endurecido (a resposta).
- `fixed-pdb.yaml` — o PodDisruptionBudget (um objeto separado).
- `fixed-netpol.yaml` — a NetworkPolicy de default-deny + allow (objetos separados).
- `PRODUCTION-CHECKLIST.md` — o checklist contra o qual você audita, escrito para guardar.

Tudo recebe o label `app.kubernetes.io/name: web` (e o falho, `app: s26`), então o cleanup é um único
selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./26-capstone.solution.md#guided-solutions)

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

> **Por que auditar antes de revelar.** A habilidade profissional que este capstone constrói é *ler um
> manifesto contra um checklist* — enxergar as omissões. No trabalho ninguém te entrega um gabarito; o
> checklist é o gabarito. Faça a auditoria no frio e só depois compare.

**Pergunta:** o manifesto falho **aplica sem erro** com `kubectl apply` em um namespace padrão —
então por que ele está "errado"?

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

---

### Step 4 — classifique cada correção: availability vs security vs cost

**Tarefa:** separe as dez correções em **availability**, **security** e **cost**, e decida quais
importam mais para *este* workload (um web front end stateless).

---

### Step 5 — confirme a cobertura completa do checklist

**Tarefa:** percorra o `PRODUCTION-CHECKLIST.md` linha a linha contra os manifestos corrigidos e marque
cada caixa.

## Observe

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

## Challenge

Um reviewer afirma que o Deployment falho está "ok" porque o kubectl apply tem sucesso e os
Pods ficam Ready. Prove que válido≠pronto: mostre que o dry-run sob restricted rejeita o Pod
template falho (ou lista as violações de PSA) enquanto o conjunto corrigido é admitido, e mapeie
pelo menos três falhas do checklist para availability versus security.

**Difficulty:** Advanced

**Success criteria:** Rode o dry-run server-side (ou o apply) dos manifestos falho versus corrigido
sob enforce=restricted, registre o contraste admission/erro e classifique três lacunas concretas do
checklist (por exemplo probes, resources, securityContext) como availability ou security com um
field path observável.

**Hints:** Use kubectl apply --dry-run=server -f flawed-deployment.yaml em um namespace
restricted; compare com o fixed-deployment.yaml; mantenha o PRODUCTION-CHECKLIST.md aberto enquanto
classifica.

[Spoiler: solução do challenge](./26-capstone.solution.md#challenge-solution)

## Verify

Confirme as evidências do capstone antes do cleanup.

```bash
kubectl get deploy,pdb,networkpolicy -n "$NS"
kubectl apply -f fixed-deployment.yaml --dry-run=server
```

Esperado: os objetos corrigidos (ou o sucesso do dry-run) permanecem, para que a cobertura do
checklist possa ser reauditada.

## Cleanup / reset

```bash
# cleanup escopado — os objetos corrigidos compartilham app.kubernetes.io/name: web; o falho é app: s26
kubectl delete -f fixed-netpol.yaml -f fixed-pdb.yaml -f fixed-deployment.yaml --ignore-not-found
kubectl delete deployment -l app=s26 -n "$NS" --ignore-not-found
# reset de pânico (namespace): deletar Namespace é proibido neste workshop — remova-o
# out-of-band pela UI do seu cluster se for realmente preciso; não cole aqui um ns delete sem qualificação
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
rm -f flawed-deployment.yaml fixed-deployment.yaml fixed-pdb.yaml fixed-netpol.yaml \
  flawed-pod.yaml fixed-pod.yaml PRODUCTION-CHECKLIST.md
```

> **Panic reset.** Tudo viveu no namespace `s26`. Deletes de Namespace são proibidos aqui — derrube o
> ambiente descartável com `kind delete cluster` (ou pela UI do seu cluster). Isso remove o
> Deployment, o PDB, as NetworkPolicies e quaisquer Pods de uma vez só.

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

> **⚠️ O stretch mais profundo é o artefato, não o comando.** Além do admission, os gates reais são:
> um policy engine (exigir labels/resources/probes), um linter no CI e um sync GitOps que só aplica
> manifestos revisados (S21). O ponto do capstone é que o `PRODUCTION-CHECKLIST.md` vire um conjunto de
> checks aplicados, e não um documento que as pessoas pretendem ler. Esse é o hábito para levar daqui.

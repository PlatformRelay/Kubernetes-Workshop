# Lab 21 — GitOps com Flux (S21)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S21 — GitOps com Flux |
| **Environment** | **kind ✓** (instala o Flux) / namespace compartilhado: **read-only** |
| **Estimated time** | 25 min |

## Objective

Instalar o **Flux** (o GitOps Toolkit) em um cluster kind descartável, entregar a ele um
**`GitRepository`** + **`Kustomization`** que apontam para um repo Git público e observá-los
fazer **pull** desse repo para dentro do cluster — ficando **Ready** por conta própria. Depois,
sentir a parte que torna o GitOps diferente do `kubectl apply`: provocar **drift** em um recurso
gerenciado, na mão, e observar o Flux **reconciliá-lo** de volta ao Git. Por fim, **suspender**
a Kustomization (o análogo de `selfHeal: false`) e provar que, com suspend, o mesmo **drift permanece**.

O lab inteiro gira em torno de uma ideia: **Git é o estado desejado, e um agente dentro do cluster
reconcilia continuamente o cluster em direção a ele** — o loop de reconciliação da S03, com o Git como `spec`.

> **Por que não a app `web`?** Todos os outros labs dos Dias 1/2 estendem o Deployment `web`. Este
> usa deliberadamente o repo público canônico **`argoproj/argocd-example-apps` / `guestbook`**
> para rodar no kind **sem nada para hospedar** (a mesma fonte sem host da variante Argo CD).
> O único momento que precisa de um repo *gravável* (mudar o Git → re-reconciliar) é o
> **Stretch** opcional no final; o break→fix de drift obrigatório não exige nenhuma escrita no Git.

## Prerequisites

- **Caminho kind (faça este):** Docker + `kind` + `kubectl`, e permissão para criar um cluster local.
  Você vai criar um cluster descartável chamado `gitops`. O Flux roda em escopo de cluster, então este lab é
  **kind-only** — você não pode instalá-lo em um namespace compartilhado atribuído.
- **Caminho shared-cluster:** **read-only.** Se o facilitador tiver pendurado um Flux na sala,
  você pode *inspecionar* um `GitRepository` / `Kustomization` em execução (Steps 3–4 somente leitura),
  mas não instalar nem provocar drift neles. Prefira o kind se puder.
- O CLI `flux` é **opcional** — todo passo obrigatório aqui funciona só com `kubectl`.
- Acesso de pull à internet para as images dos controllers do Flux e a image do guestbook
  (`gcr.io/google-samples/gb-frontend:v5`).

## Files used

- `gitrepository.yaml` — `GitRepository` do Flux que consulta a fonte Git do guestbook.
- `kustomization.yaml` — `Kustomization` do Flux que faz o build/apply desse path e mantém
  o cluster igual ao Git (`prune: true`, `interval` curto para o lab).

Os CRs vivem em `flux-system` e são limpos por nome; os workloads do guestbook que eles
criam caem em `default` e são removidos (prune) pelo Flux no delete quando `prune: true`.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./21-gitops-flux.solution.md#guided-solutions)

### Step 0 — um cluster, e o Flux nele

### Caminho kind (faça este)

```bash
kind create cluster --name gitops

# "dev install" do Flux: apenas os controllers (sem bootstrap / sem Flux gerenciado por Git)
# server-side apply: o manifesto de instalação é grande
kubectl apply --server-side --force-conflicts \
  -f https://github.com/fluxcd/flux2/releases/latest/download/install.yaml

# o install.yaml mais recente pode trazer também image-* / source-watcher — estacione-os no kind
kubectl -n flux-system scale deploy/image-automation-controller \
  deploy/image-reflector-controller deploy/source-watcher --replicas=0 2>/dev/null || true

# aguarde os quatro controllers que este lab usa (~1–2 min em um kind recém-criado)
kubectl -n flux-system wait --for=condition=available --timeout=300s \
  deploy/source-controller deploy/kustomize-controller \
  deploy/helm-controller deploy/notification-controller
```

**Tarefa:** confirme que esses quatro Deployments do Flux em `flux-system` estão Available.

**Pergunta (opcional):** em quais quatro controllers este lab realmente espera, e o que fazem
os opcionais?

### Caminho shared-cluster (read-only)

```bash
# somente se existir um Flux do facilitador; aqui você é um espectador
kubectl config set-context --current --namespace=flux-system
kubectl get gitrepositories,kustomizations
```

Pule as escritas dos Steps 0–2; entre no **Step 3** para ler o status de uma Kustomization em execução.

---

### Step 1 — escreva o GitRepository e a Kustomization

Crie dois arquivos. Juntos, eles são a declaração GitOps inteira: **fonte** (o estado
desejado, em Git) + **pipeline de apply** (onde ele cai, com que frequência, se faz prune).

```bash
cat > gitrepository.yaml <<'EOF'
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: guestbook
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/argoproj/argocd-example-apps.git
  ref:
    branch: master
EOF

cat > kustomization.yaml <<'EOF'
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: guestbook
  namespace: flux-system
spec:
  interval: 30s
  path: ./guestbook
  prune: true
  sourceRef:
    kind: GitRepository
    name: guestbook
  targetNamespace: default
EOF
```

**Tarefa:** valide os dois contra o server antes de aplicar (os CRDs vêm com o Flux).

```bash
kubectl apply --dry-run=server -f gitrepository.yaml -f kustomization.yaml
```

---

### Step 2 — aplique-os e veja o Git ser puxado para o cluster

Não existe **nenhum comando separado de "sync"** aqui — declarar os CRs basta. O
source-controller busca o repo; o kustomize-controller faz o build de `./guestbook` e
o aplica a cada `interval`.

```bash
kubectl apply -f gitrepository.yaml -f kustomization.yaml
kubectl -n flux-system get gitrepository,kustomization guestbook -w
# Ctrl-C quando os dois mostrarem READY=True
```

**Tarefa:** observe os dois chegarem a `READY=True`, depois confirme que o workload do guestbook
caiu em `default`.

```bash
kubectl -n default get deploy,svc guestbook-ui
kubectl -n default get pods -l app=guestbook-ui
```

**Pergunta:** você definiu `ref.branch: master`. O que isso acompanha, e quando você fixaria uma
tag ou um commit SHA em vez disso?

---

### Step 3 — leia as condições Ready (source vs apply)

O Flux reporta prontidão em **cada** objeto. O GitRepository responde "buscamos o Git?";
a Kustomization responde "aplicamos aquele artifact com sucesso?"

```bash
kubectl -n flux-system get gitrepository guestbook \
  -o custom-columns='READY:.status.conditions[?(@.type=="Ready")].status,MESSAGE:.status.conditions[?(@.type=="Ready")].message'
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='READY:.status.conditions[?(@.type=="Ready")].status,MESSAGE:.status.conditions[?(@.type=="Ready")].message'
```

**Tarefa:** leia o Ready da fonte e o da Kustomization separadamente.

---

### Step 4 — break→fix: provoque drift na mão, veja o reconcile reverter

O momento GitOps. O Git diz que o `guestbook-ui` tem **1** réplica. Mude isso na mão e veja
o Flux notar o drift no próximo reconcile e **colocar de volta** — sem humano, sem
`kubectl apply` do guestbook.

```bash
kubectl -n default scale deployment guestbook-ui --replicas=5
kubectl -n default get deploy guestbook-ui -w    # Ctrl-C depois que estabilizar de volta em 1
```

**Tarefa:** veja a contagem de réplicas saltar brevemente em direção a 5 e então ser arrastada
de volta para **1** pelo Flux (em ~30s — o `interval` da Kustomization).

**Pergunta (obrigatória):** o que aconteceria com esse scale manual se a Kustomization estivesse
**suspensa** (`spec.suspend: true` — o análogo de `selfHeal: false`)?

Prove:

```bash
# suspenda a reconciliação (a detecção/apply deixa de agir sobre o cluster)
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":true}}'

# provoque o drift de novo
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 40
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='SUSPEND:.spec.suspend,READY:.status.conditions[?(@.type=="Ready")].status'
kubectl -n default get deploy guestbook-ui
```

Esperado: as réplicas **permanecem em 5** enquanto suspenso. Retome e veja o Flux curar:

```bash
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n default get deploy guestbook-ui -w    # de volta a 1
```

---

## Observe

- **Pull, não push.** Você aplicou um `GitRepository` + `Kustomization`; o Flux puxou o
  repo do guestbook e fez o deploy — você nunca rodou `kubectl apply` nos manifestos do guestbook.
- **Source Ready ≠ Apply Ready.** Sucesso de fetch e sucesso de apply são condições separadas —
  leia as duas.
- **O reconcile reverte drift.** Um scale manual para 5 foi arrastado de volta ao 1 do Git, automaticamente.
- **Suspend ≠ detecção de drift sempre ligada.** Com `suspend: true`, o Flux **para de aplicar** — o mesmo drift permanece
  (o análogo do `selfHeal: false` do Argo). Retome e ele cura de novo.

## Challenge

As réplicas do guestbook permanecem em drift depois de um scale manual, e a Kustomization
não as corrige mais. Diagnostique suspend versus uma condição Ready com falha, retome (ou
corrija), e prove que o Deployment vivo volta a corresponder ao Git.

**Difficulty:** Intermediate

**Success criteria:** Leia o .spec.suspend e a condição Ready da Kustomization, identifique que
suspend está true ou que o apply está falhando, remova o bloqueio e prove que as réplicas
retornam à contagem desejada no Git com Ready=True.

**Hints:** Inspecione spec.suspend e status.conditions na Kustomization; compare as réplicas de
kubectl get deploy com o manifesto do guestbook no Git; aplique patch de suspend para false ou
corrija a mensagem de Ready.

[Spoiler: solução do challenge](./21-gitops-flux.solution.md#challenge-solution)

## Verify

Confirme as evidências do Flux antes do cleanup.

```bash
kubectl -n flux-system get gitrepository,kustomization guestbook
kubectl -n default get deploy,svc guestbook-ui
```

Esperado: o status Ready continua legível para que o comportamento de suspend / reconcile
possa ser reverificado.

## Cleanup / reset

```bash
# delete a Kustomization primeiro; prune:true faz o Flux remover os workloads do guestbook
kubectl -n flux-system delete kustomization guestbook
kubectl -n default get deploy,svc guestbook-ui   # esperado: NotFound
kubectl -n flux-system delete gitrepository guestbook

# limpe os arquivos locais
rm -f gitrepository.yaml kustomization.yaml
```

## Stretch (optional) — mude o Git, veja-o re-reconciliar

Este é o momento "o Git é a fonte da verdade" de ponta a ponta — ele precisa de um repo em que **você possa fazer push**.

1. Faça um **fork** de `https://github.com/argoproj/argocd-example-apps` no GitHub (ou faça push de uma
   cópia para qualquer host Git que você controle).
2. Aponte o GitRepository para o seu fork: edite a `url` do `gitrepository.yaml` para a URL do seu fork e
   rode `kubectl apply -f gitrepository.yaml` de novo.
3. No seu fork, edite `guestbook/guestbook-ui-deployment.yaml` — suba `replicas` para `2` — e
   `git commit && git push`.
4. Veja o Flux detectar o novo commit e re-reconciliar:

```bash
kubectl -n flux-system get gitrepository,kustomization guestbook -w
```

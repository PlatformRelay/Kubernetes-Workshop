# Lab 21 — GitOps com Argo CD (S21)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S21 — GitOps com Argo CD |
| **Environment** | **kind ✓** (instala o Argo CD) / namespace compartilhado: **read-only** |
| **Estimated time** | 25 min |

## Objective

Instalar o **Argo CD** em um cluster kind descartável, entregar a ele uma **`Application`** que
aponta para um repo Git público e observá-lo fazer **pull** desse repo para dentro do cluster —
ficando **Synced / Healthy** por conta própria. Depois, sentir a parte que torna o GitOps
diferente do `kubectl apply`: provocar **drift** em um recurso gerenciado, na mão, e observar o
**self-heal** do Argo CD revertê-lo de volta ao Git.

O lab inteiro gira em torno de uma ideia: **Git é o estado desejado, e um agente dentro do
cluster reconcilia continuamente o cluster em direção a ele** — o loop de reconciliação da S03,
com o Git como `spec`.

> **Por que não a app `web`?** Todos os outros labs dos Dias 1/2 estendem o Deployment `web`.
> Este usa deliberadamente o repo público canônico **`argoproj/argocd-example-apps` /
> `guestbook`** para rodar no kind **sem nada para hospedar**. O único momento que precisa de um
> repo *gravável* (mudar o Git → re-sincronizar) é o **Stretch** opcional no final; o break→fix
> de self-heal obrigatório não exige nenhuma escrita no Git.

## Prerequisites

- **Caminho kind (faça este):** Docker + `kind` + `kubectl`, e permissão para criar um cluster
  local. Você vai criar um cluster descartável chamado `gitops`. O Argo CD roda em escopo de
  cluster, então este lab é **kind-only** — você não pode instalá-lo em um namespace
  compartilhado atribuído.
- **Caminho shared-cluster:** **read-only.** Se o facilitador tiver pendurado um Argo CD na
  sala, você pode *inspecionar* uma `Application` em execução (Steps 3–4 somente leitura), mas
  não instalar nem provocar drift nela. Prefira o kind se puder.
- O CLI `argocd` é **opcional** — todo passo obrigatório aqui funciona só com `kubectl`.
- Acesso de pull à internet para as images do Argo CD e a image do guestbook
  (`gcr.io/google-samples/gb-frontend:v5`).

## Files used

- `application.yaml` — a `Application` do Argo CD que liga a fonte Git do guestbook a este
  cluster (o frame final do magic-move do slide, **byte a byte**).

A Application não carrega labels extras — ela vive no namespace `argocd` e é limpa por nome; os
workloads do guestbook que ela cria caem em `default` e são removidos (prune) pelo Argo no delete.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler contém os
comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./21-gitops.solution.md#guided-solutions)

### Step 0 — um cluster, e o Argo CD nele

### Caminho kind (faça este)

```bash
kind create cluster --name gitops
kubectl create namespace argocd

# server-side apply: o manifesto de install é grande demais para o apply client-side
kubectl apply -n argocd --server-side --force-conflicts \
  -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# espere o control plane subir (~1–2 min em um kind novo)
kubectl -n argocd wait --for=condition=available deploy --all --timeout=300s
```

**Tarefa:** confirme que todos os Deployments do Argo CD estão Available.

**Pergunta (opcional):** onde está a senha de admin, se você quiser abrir a UI?

### Caminho shared-cluster (read-only)

```bash
# só se existir um Argo CD do facilitador; aqui você é espectador
kubectl config set-context --current --namespace=argocd
kubectl get applications
```

Pule as escritas dos Steps 0–2; entre no **Step 3** para ler o status de uma Application em
execução.

---

### Step 1 — escreva a Application

Crie o `application.yaml`. Esta é a declaração GitOps inteira: **source** (o estado desejado, no
Git) + **destination** (onde ele cai) + **syncPolicy** (mantenha igual, sem intervenção).

```bash
cat > application.yaml <<'EOF'
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: guestbook
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/argoproj/argocd-example-apps.git
    targetRevision: HEAD
    path: guestbook
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
EOF
```

**Tarefa:** valide-o contra o server antes de aplicar (o CRD vem junto com o Argo CD).

```bash
kubectl apply --dry-run=server -f application.yaml
```

---

### Step 2 — aplique-a e veja o Git ser puxado para o cluster

**Não existe comando "sync"** aqui — declarar a Application já basta. Como o
`syncPolicy.automated` está definido, o Argo CD vê a nova Application, faz o pull do repo e o
aplica.

```bash
kubectl apply -f application.yaml
kubectl -n argocd get application guestbook -w   # Ctrl-C assim que ler Synced / Healthy
```

**Tarefa:** observe a app chegar a `SYNC STATUS: Synced` e `HEALTH STATUS: Healthy`, depois
confirme que o workload do guestbook realmente caiu em `default`.

```bash
kubectl -n default get deploy,svc guestbook-ui
kubectl -n default get pods -l app=guestbook-ui
```

**Pergunta:** você definiu `targetRevision: HEAD`. O que isso acompanha, e quando você mudaria?

---

### Step 3 — leia os dois statuses (os dois eixos independentes)

O Argo reporta **duas** coisas que se movem de forma independente: o cluster == Git (**sync**) e
os workloads estão OK (**health**)?

```bash
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
```

**Tarefa:** leia o sync status e o health status separadamente.

---

### Step 4 — break→fix: provoque drift na mão, veja o self-heal reverter

O momento GitOps. O Git diz que o `guestbook-ui` tem **1** réplica. Mude isso na mão e observe o
Argo CD perceber o drift e **colocar de volta** — sem humano, sem `kubectl apply`.

```bash
kubectl -n default scale deployment guestbook-ui --replicas=5
kubectl -n default get deploy guestbook-ui -w    # Ctrl-C depois que assentar de volta em 1
```

**Tarefa:** veja a contagem de réplicas saltar brevemente em direção a 5 e depois ser arrastada
de volta para **1** pelo Argo.

**Pergunta (obrigatória):** o que aconteceria com esse scale manual se o `selfHeal` estivesse
**desligado**?

---

## Observe

- **Pull, não push.** Você aplicou uma única `Application`; o Argo CD fez o pull do repo do
  guestbook e o implantou — você nunca deu `kubectl apply` nos manifestos do guestbook.
- **Synced / Healthy são independentes.** Sync = "cluster == Git?"; health = "workloads OK?" —
  leia os dois em `.status.sync.status` e `.status.health.status`.
- **O self-heal reverte o drift.** Um scale manual para 5 foi arrastado de volta para o 1 do
  Git, automaticamente.
- **Detecção de drift ≠ self-heal.** Com `selfHeal: false`, o mesmo drift continua `OutOfSync` e
  *não* é revertido — a detecção sempre roda; o self-heal é a correção automática por cima.

## Challenge

O guestbook mostra OutOfSync depois de um scale manual, mas as réplicas não voltam ao Git.
Diagnostique sync automated versus selfHeal, restaure o self-heal (ou o sync) e prove que o
Deployment vivo corresponde ao Git de novo.

**Difficulty:** Intermediate

**Success criteria:** Leia .status.sync.status e .status.health.status da Application,
identifique que selfHeal está false ou que o sync automated está incompleto, reative o selfHeal
ou o sync, e prove que as réplicas voltam à contagem desejada pelo Git com status Synced.

**Hints:** Inspecione spec.syncPolicy.automated na Application; compare as réplicas de
kubectl get deploy com o manifesto guestbook do Git; aplique patch de selfHeal true ou rode
argocd/kubectl sync.

[Spoiler: solução do challenge](./21-gitops.solution.md#challenge-solution)

## Verify

Confirme as evidências da Application antes do cleanup.

```bash
kubectl -n argocd get application guestbook
kubectl -n default get deploy,svc guestbook-ui
```

Esperado: os status de sync/health continuam legíveis, para que o comportamento de self-heal
possa ser reverificado.

## Cleanup / reset

```bash
# delete a Application; prune:true significa que o Argo remove os workloads do guestbook que criou
kubectl -n argocd delete application guestbook
kubectl -n default get deploy,svc guestbook-ui   # esperado: NotFound

# limpe os arquivos locais
rm -f application.yaml
```

## Stretch (optional) — mude o Git, veja-o re-sincronizar

Este é o momento "o Git é a fonte da verdade" de ponta a ponta — ele precisa de um repo **em que
você consiga dar push**.

1. Faça um **fork** de `https://github.com/argoproj/argocd-example-apps` no GitHub (ou envie uma
   cópia para qualquer host Git que você controle).
2. Aponte a Application para o seu fork: edite o `repoURL` do `application.yaml` para a URL do
   seu fork e dê `kubectl apply -f application.yaml` de novo.
3. No seu fork, edite `guestbook/guestbook-ui-deployment.yaml` — suba `replicas` para `2` — e
   `git commit && git push`.
4. Observe o Argo detectar o novo commit e re-sincronizar:

```bash
kubectl -n argocd get application guestbook -w
```

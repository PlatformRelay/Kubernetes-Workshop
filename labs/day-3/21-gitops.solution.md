# Lab 21 — GitOps com Argo CD (S21) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n argocd wait --for=condition=available deploy --all --timeout=300s
deployment.apps/argocd-applicationset-controller condition met
deployment.apps/argocd-dex-server condition met
deployment.apps/argocd-notifications-controller condition met
deployment.apps/argocd-redis condition met
deployment.apps/argocd-repo-server condition met
deployment.apps/argocd-server condition met
```

O `argocd-application-controller` é um **StatefulSet**, não um Deployment, então ele não aparece
nessa lista — verifique-o também com `kubectl -n argocd rollout status statefulset/argocd-application-controller`.
Instalamos com `--server-side` porque o `install.yaml` empacotado é maior do que a annotation
`kubectl.kubernetes.io/last-applied-configuration` consegue guardar; um `kubectl apply`
client-side puro emite aviso ou falha nele.
</details>

**Pergunta (opcional):** onde está a senha de admin, se você quiser abrir a UI?

<details><summary>Resposta</summary>

O Argo CD gera uma senha inicial de admin em um Secret na primeira instalação:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d ; echo
# depois, em outro terminal:
kubectl -n argocd port-forward svc/argocd-server 8080:443
# acesse https://localhost:8080  (usuário: admin) — aceite o certificado self-signed
```

A UI é um bônus; **este lab nunca precisa dela** — lemos o status com `kubectl` e com o CLI
`argocd`. (Com o CLI: `argocd admin initial-password -n argocd` imprime a mesma senha.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
application.argoproj.io/guestbook created (server dry run)
```

O `--dry-run=server` roda as checagens de schema + admission contra a API real (o CRD
`Application` foi instalado no Step 0) sem persistir nada. Se ele falhar com
`no matches for kind "Application"`, o Argo CD ainda não está instalado — termine o Step 0.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n argocd get application guestbook
NAME        SYNC STATUS   HEALTH STATUS
guestbook   Synced        Healthy

$ kubectl -n default get deploy,svc guestbook-ui
NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/guestbook-ui  1/1     1            1           40s
NAME                   TYPE        CLUSTER-IP     PORT(S)   AGE
service/guestbook-ui   ClusterIP   10.x.x.x       80/TCP    40s

$ kubectl -n default get pods -l app=guestbook-ui
NAME                           READY   STATUS    RESTARTS   AGE
guestbook-ui-xxxxxxxxx-xxxxx   1/1     Running   0          40s
```

> Note: os **objetos Deployment e Service do guestbook não carregam o label `app`** (só os
> *pods* carregam), então pegamos os workloads **pelo nome** e filtramos apenas os *pods* com
> `-l app=guestbook-ui`.

Ele passa por `OutOfSync → Progressing → Synced/Healthy` em ~30–90s: o Argo fez o pull dos
manifestos do `path: guestbook` do repo e os aplicou — **você nunca rodou `kubectl apply` no
guestbook em si.** Esse é o modelo pull: você declarou o *quê* (uma Application) e o agente
dentro do cluster fez o *como*.
</details>

**Pergunta:** você definiu `targetRevision: HEAD`. O que isso acompanha, e quando você mudaria?

<details><summary>Resposta</summary>

O `HEAD` acompanha a **ponta da branch padrão do repo** — o que estiver mais recente. Em
produção você normalmente fixaria uma **branch** (`main`, `release`), uma **tag** (`v1.4.0`) ou
um **commit SHA** exato, para que um deploy seja reproduzível e um rollback seja "aponte o
`targetRevision` para o commit anterior". O `HEAD` é conveniente para uma demo, mas significa
"sempre a coisa mais nova daquele repo".
</details>

---

### Step 3 — leia os dois statuses (os dois eixos independentes)

O Argo reporta **duas** coisas que se movem de forma independente: o cluster == Git (**sync**) e
os workloads estão OK (**health**)?

```bash
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
```

**Tarefa:** leia o sync status e o health status separadamente.

<details><summary>Solução / saída esperada</summary>

```console
SYNC     HEALTH
Synced   Healthy
```

- **Sync status** (`Synced` / `OutOfSync` / `Unknown`) responde *o estado vivo corresponde ao
  Git?* — um diff puro.
- **Health status** (`Healthy` / `Progressing` / `Degraded` / `Missing` / `Suspended`) responde
  *os workloads estão realmente de pé?* — as health checks por recurso do Argo.

Eles são ortogonais: você pode estar `Synced + Degraded` (você implantou fielmente um manifesto
quebrado — conserte o Git) ou `OutOfSync + Healthy` (um patch manual que funciona, mas não está
no Git — o self-heal vai revertê-lo). O próximo passo fabrica exatamente esse segundo caso.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n default scale deployment guestbook-ui --replicas=5
deployment.apps/guestbook-ui scaled

$ kubectl -n default get deploy guestbook-ui -w
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   1/5     5            1           6m
guestbook-ui   5/5     5            5           6m
guestbook-ui   1/1     1            1           6m    # o self-heal reverteu
```

Você escalou para 5; dentro de um ciclo de reconciliação o Argo CD comparou o vivo (5) com o Git
(1), viu o **drift** e **reaplicou o Git** — de volta para 1. Isso é `selfHeal: true`. O cluster
*se recusa a permanecer em drift em relação ao Git*. Este é o loop de reconciliação da S03 com o
Git na vaga do "desejado": observar → diff (5 ≠ 1) → agir (reaplicar) → repetir. Se você estava
observando a Application, ela piscou `OutOfSync → Synced` enquanto se curava.
</details>

**Pergunta (obrigatória):** o que aconteceria com esse scale manual se o `selfHeal` estivesse
**desligado**?

<details><summary>Resposta — prove você mesmo</summary>

Com o self-heal desligado, o Argo continua **detectando** o drift (ele sempre detecta), mas
**não** o reverte — a app simplesmente fica em `OutOfSync` até que um humano sincronize. Prove:

```bash
# desligue o self-heal
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":false}}}}'

# provoque o drift de novo
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 20
kubectl -n argocd get application guestbook \
  -o custom-columns='SYNC:.status.sync.status,HEALTH:.status.health.status'
kubectl -n default get deploy guestbook-ui
```

```console
SYNC       HEALTH
OutOfSync  Healthy
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   5/5     5            5           8m      # continua em 5 — NÃO revertido
```

`OutOfSync + Healthy`: as 5 réplicas rodam felizes, mas o cluster não corresponde mais ao Git e o
Argo **deixa quieto**. A *detecção* de drift está sempre ligada; o **self-heal** é a reversão
automática por cima. Coloque tudo de volta e restaure a policy:

```bash
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"selfHeal":true}}}}'
```

Reativar o self-heal faz o Argo reverter o drift de novo dentro de um ciclo de reconciliação —
de volta a 1 réplica, `Synced`.

</details>

---

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

<details><summary>O que você deve ver — e por que isso importa</summary>

Dentro do intervalo de polling do Argo (~3 min por padrão, ou imediatamente se você ligar um
webhook / rodar `argocd app get guestbook --refresh`), a app vira `Synced → OutOfSync → Synced` e
o Deployment vivo passa para **2 réplicas** — porque **o Git mudou**, não porque alguém tocou no
cluster. É essa a disciplina inteira: o **único** jeito de mudar o cluster é mudar o Git, e toda
mudança é um commit revisável e revertível. Compare com o Step 4, em que uma mudança de
*cluster* (drift) foi revertida; aqui é uma mudança de *Git* que de fato se propaga.

Limpe o caminho do fork da mesma forma: `kubectl -n argocd delete application guestbook`.
</details>

## Expected state / output

- **Pull, não push.** Você aplicou uma única `Application`; o Argo CD fez o pull do repo do
  guestbook e o implantou — você nunca deu `kubectl apply` nos manifestos do guestbook.
- **Synced / Healthy são independentes.** Sync = "cluster == Git?"; health = "workloads OK?" —
  leia os dois em `.status.sync.status` e `.status.health.status`.
- **O self-heal reverte o drift.** Um scale manual para 5 foi arrastado de volta para o 1 do
  Git, automaticamente.
- **Detecção de drift ≠ self-heal.** Com `selfHeal: false`, o mesmo drift continua `OutOfSync` e
  *não* é revertido — a detecção sempre roda; o self-heal é a correção automática por cima.

Statuses representativos incluem Pods Ready/Running, os sync statuses `Synced/OutOfSync` da
Application, os health statuses `Healthy/Progressing`, o drift mantido em `OutOfSync` enquanto
`selfHeal: false` e revertido automaticamente com `selfHeal: true`, e a mensagem de revision do
último sync — compare o significado, não valores efêmeros (SHAs de revision, sufixos de nome de
Pod, idades).

## Explanation

O Argo CD detecta drift continuamente, mas só o selfHeal (ou um sync manual) age para
reconciliar. Sync e health são eixos independentes (uma app Healthy ainda pode estar OutOfSync),
e é essa a causa de o challenge exigir a leitura dos dois campos de status e da syncPolicy que
autoriza a correção.

Os passos guiados acima provam o comportamento do control plane para esta seção; leia os Events
e os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f <file> -n "$NS"` depois de
corrigir o campo quebrado, ou delete apenas os objetos com label da seção Cleanup / reset e
reinicie o guided task. Prefira os Events do `kubectl describe` a chutar. Não rode deletes
amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl -n argocd get application guestbook -o jsonpath='{.status.sync.status} {.status.health.status}{"\n"}'
kubectl -n argocd get application guestbook -o jsonpath='{.spec.syncPolicy}{"\n"}'
kubectl -n default get deploy guestbook-ui
kubectl -n argocd patch application guestbook --type merge \
  -p '{"spec":{"syncPolicy":{"automated":{"prune":true,"selfHeal":true}}}}'
kubectl -n argocd get application guestbook -w
```

### Expected state / output

Com o selfHeal desligado, a app permanece OutOfSync na contagem de réplicas em drift. Depois que
o selfHeal é restaurado (ou após um sync), o status volta a Synced e a contagem de réplicas do
Deployment corresponde ao Git.

### Explanation

O Argo CD detecta drift continuamente, mas só o selfHeal (ou um sync manual) age para
reconciliar. Sync e health são eixos independentes (uma app Healthy ainda pode estar OutOfSync),
e é essa a causa de o challenge exigir a leitura dos dois campos de status e da syncPolicy que
autoriza a correção.

### Hints

Inspecione spec.syncPolicy.automated na Application; compare as réplicas de
kubectl get deploy com o manifesto guestbook do Git; aplique patch de selfHeal true ou rode
argocd/kubectl sync.

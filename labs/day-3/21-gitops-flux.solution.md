# Lab 21 — GitOps com Flux (S21) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n flux-system wait --for=condition=available --timeout=300s \
    deploy/source-controller deploy/kustomize-controller \
    deploy/helm-controller deploy/notification-controller
deployment.apps/source-controller condition met
deployment.apps/kustomize-controller condition met
deployment.apps/helm-controller condition met
deployment.apps/notification-controller condition met
```

Instalamos com `--server-side` porque o `install.yaml` embutido é grande; um `kubectl apply`
client-side puro pode avisar ou falhar no tamanho da annotation. Este é o caminho de **dev
install** do Flux — apenas os controllers, sem `flux bootstrap` e sem um Flux gerenciado pelo
próprio Git — que é o que um lab kind descartável precisa. Esperar por Deployments nomeados (e não
`--all`) mantém o lab verde quando o `latest` também traz os controllers opcionais image-* / source-watcher.
</details>

**Pergunta (opcional):** em quais quatro controllers este lab realmente espera, e o que fazem
os opcionais?

<details><summary>Resposta</summary>

Este lab espera nos quatro controllers de que o caminho do guestbook precisa:

- **source-controller** — busca artifacts de Git/Helm/OCI/Bucket
- **kustomize-controller** — faz build e apply de Kustomizations (o caminho de apply deste lab)
- **helm-controller** — reconcilia HelmReleases (não usado nos passos obrigatórios)
- **notification-controller** — alerts / providers (não usado nos passos obrigatórios)

O `latest` também pode instalar **image-automation-controller**, **image-reflector-controller**
e **source-watcher** — úteis em fluxos de image-update em produção, mas estacionados em 0 réplicas
no kind para que um laptop pequeno não fique brigando com sete controllers. O `flux check` do CLI
`flux` opcional imprime a prontidão dos CRDs para o que ainda estiver em execução.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
gitrepository.source.toolkit.fluxcd.io/guestbook created (server dry run)
kustomization.kustomize.toolkit.fluxcd.io/guestbook created (server dry run)
```

O `--dry-run=server` roda as checagens de schema + admission contra a API real (os CRDs do Flux
foram instalados no Step 0) sem persistir nada. Se der erro com `no matches for kind
"GitRepository"`, o Flux ainda não está instalado — termine o Step 0.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n flux-system get gitrepository,kustomization guestbook
NAME                                               URL                                                   AGE   READY   STATUS
gitrepository.source.toolkit.fluxcd.io/guestbook   https://github.com/argoproj/argocd-example-apps.git   5s    True    stored artifact for revision 'master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5'

NAME                                                  AGE   READY   STATUS
kustomization.kustomize.toolkit.fluxcd.io/guestbook   5s    True    Applied revision: master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5

$ kubectl -n default get deploy,svc guestbook-ui
NAME                          READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/guestbook-ui  1/1     1            1           40s
NAME                   TYPE        CLUSTER-IP     PORT(S)   AGE
service/guestbook-ui   ClusterIP   10.x.x.x       80/TCP    40s

$ kubectl -n default get pods -l app=guestbook-ui
NAME                           READY   STATUS    RESTARTS   AGE
guestbook-ui-xxxxxxxxx-xxxxx   1/1     Running   0          40s
```

> Nota: os objetos **Deployment e Service do guestbook não carregam label `app`** (apenas os *pods*
> carregam), então pegamos os workloads **por nome** e filtramos com `-l app=guestbook-ui` apenas os *pods*.

Ele vai de `READY=False → True` em ~30–90s: o Flux puxou os manifestos do repo no
`path: ./guestbook` e os aplicou — **você nunca rodou `kubectl apply` no próprio
guestbook.** É esse o modelo pull: você declarou *o quê* (source + kustomization) e os
agentes dentro do cluster fizeram o *como*.
</details>

**Pergunta:** você definiu `ref.branch: master`. O que isso acompanha, e quando você fixaria uma
tag ou um commit SHA em vez disso?

<details><summary>Resposta</summary>

`branch: master` acompanha a **ponta daquela branch** — o que estiver mais recente a cada
interval de fetch. Em produção você normalmente fixaria uma **tag** (`v1.4.0`) ou um **commit SHA**
exato, para que um deploy seja reproduzível e um rollback seja "aponte o `ref` para o commit
anterior". Uma branch flutuante é conveniente para uma demo, mas significa "sempre a coisa mais
nova daquela branch".
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
READY   MESSAGE
True    stored artifact for revision 'master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5'

READY   MESSAGE
True    Applied revision: master@sha1:8088f4c0d970abb09e250248cc97e35623447cb5
```

- **GitRepository Ready** responde *buscamos e armazenamos um artifact do Git?*
- **Kustomization Ready** responde *fizemos o build e o apply daquele artifact com sucesso?*

Eles são sequenciais: uma falha de fetch impede a Kustomization de aplicar uma revisão nova; uma
falha de apply pode deixar a fonte Ready enquanto a Kustomization não está. O próximo passo
fabrica um drift no cluster que a Kustomization cura quando não está suspensa.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl -n default scale deployment guestbook-ui --replicas=5
deployment.apps/guestbook-ui scaled

$ kubectl -n default get deploy guestbook-ui -w
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   1/5     5            1           6m
guestbook-ui   5/5     5            5           6m
guestbook-ui   1/1     1            1           6m    # o reconcile reverteu
```

Você escalou para 5; dentro de um interval de reconcile o Flux comparou o vivo contra o Git, viu
**drift** e **reaplicou o Git** — de volta a 1. O cluster *se recusa a permanecer em drift em
relação ao Git* enquanto a Kustomization está ativa. Este é o loop de reconciliação da S03 com o
Git na vaga do "desejado": observe → diff (5 ≠ 1) → aja (reaplique) → repita.
</details>

**Pergunta (obrigatória):** o que aconteceria com esse scale manual se a Kustomization estivesse
**suspensa** (`spec.suspend: true` — o análogo de `selfHeal: false`)?

<details><summary>Resposta — prove</summary>

Com a Kustomization suspensa, o Flux **para de aplicar** — o drift permanece até que um humano
retome (ou delete/recrie). Prove:

```bash
# suspenda a reconciliação
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":true}}'

# provoque o drift de novo
kubectl -n default scale deployment guestbook-ui --replicas=5
sleep 40
kubectl -n flux-system get kustomization guestbook \
  -o custom-columns='SUSPEND:.spec.suspend,READY:.status.conditions[?(@.type=="Ready")].status'
kubectl -n default get deploy guestbook-ui
```

```console
SUSPEND   READY
true      True
NAME           READY   UP-TO-DATE   AVAILABLE   AGE
guestbook-ui   5/5     5            5           8m      # continua em 5 — NÃO revertido
```

`suspend: true` é o análogo do **selfHeal: false** no Flux: o último estado aplicado ainda pode
parecer Ready, mas o controller não vai corrigir um novo drift do cluster. Coloque de volta:

```bash
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n default get deploy guestbook-ui -w
```

Reativar a reconciliação faz o Flux reverter o drift de novo dentro de um interval — de volta a 1
réplica, Ready=True.

</details>

---

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

<details><summary>O que você deve ver — e por que isso importa</summary>

Dentro do interval de fetch do GitRepository (1m aqui) e do próximo reconcile da Kustomization, a
revisão avança e o Deployment vivo vai para **2 réplicas** — porque o **Git mudou**, não porque
alguém tocou no cluster. É essa a disciplina inteira: a **única** forma de mudar o cluster é mudar
o Git, e toda mudança é um commit revisável e revertível. Compare com o Step 4, onde uma mudança de
*cluster* (drift) foi revertida; aqui é uma mudança no *Git* que de fato se propaga.

Limpe o caminho do fork da mesma forma: delete a Kustomization (o prune remove os workloads), depois
o GitRepository.
</details>

## Expected state / output

- **Pull, não push.** Você aplicou um `GitRepository` + `Kustomization`; o Flux puxou o
  repo do guestbook e fez o deploy — você nunca rodou `kubectl apply` nos manifestos do guestbook.
- **Source Ready ≠ Apply Ready.** Sucesso de fetch e sucesso de apply são condições separadas.
- **O reconcile reverte drift.** Um scale manual para 5 foi arrastado de volta ao 1 do Git, automaticamente.
- **Suspend ⇒ o drift permanece.** Com `spec.suspend: true`, o mesmo drift *não* é revertido —
  o análogo do `selfHeal: false` do Argo.

Os status representativos incluem Pods Ready/Running, condições `Ready=True/False` do GitRepository
e da Kustomization, progresso `Reconciling` no estilo kstatus, mensagens de stored-artifact e de
Applied-revision, e a flag `spec.suspend` da Kustomization — compare o significado, não os valores
efêmeros (SHAs de revisão, sufixos de nomes de Pod, idades).

## Explanation

O Flux reconcilia continuamente quando uma Kustomization não está suspensa, mas apenas uma
Kustomization ativa (não suspensa) age para corrigir drift do cluster — é essa a causa de o drift
permanecer sob suspend. O Ready da fonte e o Ready do apply são eixos independentes (um
GitRepository Ready ainda pode alimentar uma Kustomization que falha), então o challenge está em
ler os dois campos de status e a flag suspend que autoriza a correção.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e os
campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Reaplique os manifestos nomeados do lab com `kubectl apply -f gitrepository.yaml -f kustomization.yaml`
depois de corrigir o campo quebrado, ou delete apenas os CRs nomeados do guestbook do Cleanup / reset e
recomece a guided task. Prefira os Events de `kubectl describe gitrepository,kustomization -n flux-system`
a chutar. Não rode deletes amplos no cluster.

## Challenge solution

### Commands / manifest

```bash
kubectl -n flux-system get kustomization guestbook \
  -o jsonpath='{.spec.suspend} {.status.conditions[?(@.type=="Ready")].status} {.status.conditions[?(@.type=="Ready")].message}{"\n"}'
kubectl -n default get deploy guestbook-ui
kubectl -n flux-system patch kustomization guestbook --type merge \
  -p '{"spec":{"suspend":false}}'
kubectl -n flux-system get kustomization guestbook -w
```

### Expected state / output

Com suspend true, as réplicas permanecem na contagem em drift. Depois que o suspend é removido (ou
que uma falha de Ready é corrigida), o status volta a Ready=True e a contagem de réplicas do
Deployment corresponde ao Git.

### Explanation

O Flux reconcilia continuamente quando uma Kustomization não está suspensa, mas apenas uma
Kustomization ativa (não suspensa) age para corrigir drift do cluster — é essa a causa de o drift
permanecer sob suspend. O Ready da fonte e o Ready do apply são eixos independentes (um
GitRepository Ready ainda pode alimentar uma Kustomization que falha), então o challenge está em
ler os dois campos de status e a flag suspend que autoriza a correção.

### Hints

Inspecione spec.suspend e status.conditions na Kustomization; compare as réplicas de
kubectl get deploy com o manifesto do guestbook no Git; aplique patch de suspend para false ou
corrija a mensagem de Ready.

# Lab 20 — Helm (S20)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S20 — Helm |
| **Environment** | namespace ✓ / kind ✓ |
| **Estimated time** | 30 min |

## Objective

Empacotar a familiar aplicação `web` como um **chart**, instalá-la como uma **release**,
sobrescrever seus values, fazer **upgrade** por algumas revisions, depois **quebrar** um upgrade
de propósito e fazer **rollback**. Ao final você será capaz de dizer exatamente o que uma
*revision* armazena e o que o *rollback* restaura — e terá provado que `helm install` é apenas
"renderizar o template com os values, depois aplicar o resultado".

O lab inteiro gira em torno de uma ideia: **um chart é um template, uma release é uma instância
instalada, e todo install/upgrade/rollback é uma revision numerada e reversível.**

## Prerequisites

- `helm` v3.8+ (o workshop fixa o **Helm 3.21.x** via `mise`; `helm version` deve imprimir
  `v3.8` ou mais novo — o suporte a OCI, usado no stretch, é GA a partir do 3.8).
- `kubectl`, e um lugar para instalar:
  - **caminho namespace:** seu namespace atribuído no cluster compartilhado (o Helm não precisa
    de cluster-admin — ele aplica como *você*, com o seu RBAC).
  - **caminho kind:** um cluster local (`kind create cluster`).
- Acesso de pull à internet para `ghcr.io/platformrelay/workshop-web:v1` / `:v2`.

> **O Helm é um cliente.** Não há componente de servidor (nenhum "Tiller" desde o Helm 3). O
> `helm install` renderiza o chart na sua máquina e aplica o resultado com o seu kubeconfig — se
> você não consegue dar `kubectl apply` nele, o Helm também não consegue.

## Files used

Você vai criar um chart minúsculo chamado `demo-app` (quatro arquivos). Ele renderiza para
exatamente o Deployment + Service `web` do Day 1 — um chart são os seus mesmos manifestos,
parametrizados.

- `demo-app/Chart.yaml` — identidade do chart + `apiVersion: v2`.
- `demo-app/values.yaml` — os parâmetros padrão (`replicaCount`, `image.*`, `service.port`).
- `demo-app/templates/deployment.yaml` — o Deployment `web` com lacunas `{{ .Values.* }}`.
- `demo-app/templates/service.yaml` — o Service correspondente.
- `values-prod.yaml` — um arquivo de values de sobrescrita para o passo de upgrade.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler contém os
comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./20-helm.solution.md#guided-solutions)

### Step 0 — escolha um namespace

### caminho namespace (cluster compartilhado)

```bash
export NS=<your-assigned-namespace>
kubectl config set-context --current --namespace="$NS"
helm version        # esperado: v3.8+ (o workshop fixa o Helm 3.21.x)
```

### caminho kind

```bash
kind create cluster --name helm-lab
export NS=default
helm version
```

---

### Step 1 — construa o chart

Crie os quatro arquivos do chart. Os placeholders `{{ … }}` são **diretivas de template do
Helm**, não shell — o heredoc com aspas (`<<'EOF'`) impede que o seu shell os toque.

```bash
mkdir -p demo-app/templates

cat > demo-app/Chart.yaml <<'EOF'
apiVersion: v2
name: demo-app
description: A minimal web app packaged as a Helm chart
type: application
version: 0.1.0
appVersion: "v1"
EOF

cat > demo-app/values.yaml <<'EOF'
replicaCount: 1
image:
  repository: ghcr.io/platformrelay/workshop-web
  tag: "v1"
service:
  port: 80
EOF

cat > demo-app/templates/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}
    spec:
      containers:
        - name: web
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          ports:
            - containerPort: 8080
EOF

cat > demo-app/templates/service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app: {{ .Release.Name }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 8080
EOF
```

**Tarefa:** faça o lint do chart e confirme que ele é estruturalmente válido.

```bash
helm lint demo-app
```

---

### Step 2 — renderize antes de instalar (`helm template`)

O `helm template` renderiza o chart para manifestos puros **client-side** — ele nunca contata o
cluster. É assim que você *vê o que o Helm aplicaria* antes de aplicar.

```bash
helm template web demo-app
```

**Tarefa:** confirme que o Deployment renderizado tem `name: web`, `replicas: 1` e a image
`:v1` — ou seja, os values fluíram para dentro.

**Pergunta:** qual a diferença entre `helm template` e `helm install --dry-run=server`?

---

### Step 3 — instale a release (revision 1)

```bash
helm install web demo-app
helm list
kubectl get deploy,svc,pods -l app=web
```

**Tarefa:** confirme uma release chamada `web` na revision 1, e que o Pod dela está Running.

---

### Step 4 — sobrescreva values e faça upgrade (revisions 2 e 3)

Mesmo template, novos values → uma nova revision. Sobrescreva de duas formas: inline com
`--set`, e com um **arquivo** de values.

```bash
# revision 2: escale inline
helm upgrade web demo-app --set replicaCount=3

# revision 3: suba a tag da image via arquivo de values
cat > values-prod.yaml <<'EOF'
replicaCount: 3
image:
  tag: "v2"
EOF
helm upgrade web demo-app -f values-prod.yaml

helm history web
```

**Tarefa:** confirme três revisions, e que o Deployment vivo agora roda 3 réplicas na `:v2`.

```bash
kubectl get deploy web -o jsonpath='{.spec.replicas} {.spec.template.spec.containers[0].image}{"\n"}'
```

**Pergunta:** a revision 3 só definiu `image.tag`, e mesmo assim `replicas` continuou 3. Por que
não voltou ao padrão 1 do `values.yaml`?

---

### Step 5 — quebre um upgrade, depois faça rollback

Faça o upgrade para um conjunto de values que não consegue rodar — uma tag de image que não
existe — e observe os novos Pods falharem. Depois faça rollback para a última revision boa.

```bash
helm upgrade web demo-app --set image.tag=9.9.9-nope
kubectl get pods -l app=web
```

**Tarefa:** observe o novo Pod travado fazendo pull da image ruim (`ErrImagePull` / `ImagePullBackOff`).

**Tarefa:** faça rollback para a última revision boa (3) e confirme a recuperação.

```bash
helm rollback web 3
helm history web
kubectl get pods -l app=web
```

**Pergunta (obrigatória):** o que uma revision realmente armazena, e o que o `helm rollback`
restaura?

---

### Step 6 — onde o histórico vive (leitura opcional)

```bash
kubectl get secret -l owner=helm -l name=web
```

## Observe

- **Um chart é um template; uma release é uma instância.** O `helm template` renderizou o chart
  para exatamente o Deployment + Service `web` do Day 1 — client-side, sem cluster.
- **`helm install` = renderizar + aplicar como você.** Sem componente de servidor; seu RBAC se
  aplica.
- **Values fluem para dentro e são sobrescrevíveis:** `--set` (inline) e `-f` (um arquivo)
  alimentam `.Values`; o upgrade **reutiliza os values anteriores** e faz o merge das
  sobrescritas por cima.
- **Toda mudança é uma revision numerada** (`helm history`); uma revision é um **snapshot**
  completo (manifestos + values + metadata), armazenado como um `Secret` `helm.sh/release.v1`.
- **Um "sucesso" do Helm não é saúde da aplicação:** o upgrade com a tag ruim ficou "deployed",
  mas o Pod estava `ImagePullBackOff` — verifique `kubectl get pods`.
- **`rollback N` avança *para a frente* rumo a um estado antigo:** ele reexecuta a revision N
  como uma *nova* revision e nunca destrói o histórico.

## Challenge

Um helm upgrade reporta Deployed, mas os Pods da aplicação estão em ImagePullBackOff.
Diagnostique sucesso da release do Helm versus a saúde real do workload, faça rollback para a
última revision sabidamente boa e prove que o histórico da release manteve a revision que falhou.

**Difficulty:** Intermediate

**Success criteria:** Identifique o status do Pod que falha com kubectl, use helm history para
nomear a revision ruim, faça helm rollback para uma revision anterior de modo que os Pods fiquem
Ready, e prove que o history ainda lista a revision que falhou após o rollback.

**Hints:** Compare o helm status com kubectl get pods -l app=web; use helm history e
helm rollback <revision> em vez de desinstalar a release.

[Spoiler: solução do challenge](./20-helm.solution.md#challenge-solution)

## Verify

Confirme as evidências da release do Helm antes do cleanup.

```bash
helm list -n "$NS"
helm history web -n "$NS" | head
kubectl get deploy,svc,pods -n "$NS" -l app=web
```

Esperado: a release ainda existe (ou você anota a revision que vai desinstalar) e os Pods
correspondem à revision que você pretende manter.

## Cleanup / reset

```bash
# um único comando remove o workload E todo o histórico de revisions
helm uninstall web

# se você fez o stretch de OCI: remova a segunda release e o registry local
helm uninstall web2 2>/dev/null || true      # a release instalada a partir de oci://localhost:5000
docker rm -f registry 2>/dev/null || true    # o container registry:2 descartável

# limpe os arquivos locais
rm -rf demo-app values-prod.yaml demo-app-*.tgz

# confirme que nada sobrou
helm list
kubectl get deploy,svc,pods -l app=web
```

## Stretch (opcional) — envie o chart para um registry OCI

Charts são artefatos OCI, então eles vivem no **mesmo tipo de registry que as suas images**.
Empacote o chart e faça o push, depois instale direto da URL `oci://` — sem `helm repo add`.

```bash
# suba um registry local descartável (kind/Docker)
docker run -d -p 5000:5000 --name registry registry:2

# empacote o chart em um .tgz versionado, depois faça o push
helm package demo-app
helm push demo-app-0.1.0.tgz oci://localhost:5000/charts

# instale uma release nova direto da URL do registry
helm install web2 oci://localhost:5000/charts/demo-app --version 0.1.0
helm list
```

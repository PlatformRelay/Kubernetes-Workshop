# Lab 20 — Helm (S20) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ helm version
version.BuildInfo{Version:"v4.x.x", GitCommit:"…", GitTreeState:"clean", GoVersion:"go1.2x"}
```

Qualquer `v3.8+` serve. O Helm lê o **mesmo kubeconfig** que o `kubectl`, então o context e o
namespace para onde o `kubectl` está apontando são onde a sua release vai parar. É por isso que
definimos o namespace primeiro.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
==> Linting demo-app
[INFO] Chart.yaml: icon is recommended

1 chart(s) linted, 0 chart(s) failed
```

O `helm lint` verifica a estrutura do chart e a sintaxe dos templates **sem um cluster**. O INFO
sobre `icon` é apenas um aviso (uma URL de ícone do chart para UIs), não um erro — `0 chart(s)
failed` é o que importa.
</details>

---

### Step 2 — renderize antes de instalar (`helm template`)

O `helm template` renderiza o chart para manifestos puros **client-side** — ele nunca contata o
cluster. É assim que você *vê o que o Helm aplicaria* antes de aplicar.

```bash
helm template web demo-app
```

**Tarefa:** confirme que o Deployment renderizado tem `name: web`, `replicas: 1` e a image
`:v1` — ou seja, os values fluíram para dentro.

<details><summary>Solução / saída esperada</summary>

```console
---
# Source: demo-app/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
---
# Source: demo-app/templates/deployment.yaml
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
          image: "ghcr.io/platformrelay/workshop-web:v1"
          ports:
            - containerPort: 8080
```

Como passamos o nome de release `web`, todo `{{ .Release.Name }}` renderizou como `web`, e
`{{ .Values.replicaCount }}` / `{{ .Values.image.* }}` vieram direto do `values.yaml`. A saída é
**exatamente o Deployment + Service `web`** que você construiu à mão no Day 1 — e esse é todo o
ponto: um chart são os seus manifestos com as partes variáveis extraídas.
</details>

**Pergunta:** qual a diferença entre `helm template` e `helm install --dry-run=server`?

<details><summary>Resposta</summary>

O `helm template` é **100% client-side** — ele renderiza e imprime, e nunca fala com o API
server (funciona sem cluster nenhum). O `helm install --dry-run=server` renderiza **e** envia o
resultado ao API server, então ele passa por **validação + admission** de verdade (schema, Pod
Security do S17, webhooks), e depois descarta — nenhuma release é armazenada. Ou seja:
`template` = "o que isso renderizaria?"; `--dry-run=server` = "o cluster aceitaria isso de
verdade?". Nenhum dos dois instala.
</details>

---

### Step 3 — instale a release (revision 1)

```bash
helm install web demo-app
helm list
kubectl get deploy,svc,pods -l app=web
```

**Tarefa:** confirme uma release chamada `web` na revision 1, e que o Pod dela está Running.

<details><summary>Solução / saída esperada</summary>

```console
$ helm install web demo-app
NAME: web
LAST DEPLOYED: ...
NAMESPACE: <your-ns>
STATUS: deployed
REVISION: 1
TEST SUITE: None

$ helm list
NAME  NAMESPACE  REVISION  UPDATED  STATUS    CHART           APP VERSION
web   <your-ns>  1         ...      deployed  demo-app-0.1.0  v1

$ kubectl get deploy,svc,pods -l app=web
NAME                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/web   1/1     1            1           20s
NAME          TYPE        CLUSTER-IP     ...   PORT(S)
service/web   ClusterIP   10.x.x.x       ...   80/TCP
NAME                   READY   STATUS    RESTARTS   AGE
pod/web-xxxxxxxxx-xxxxx  1/1   Running   0          20s
```

O `helm install <release> <chart>` renderizou o chart e o aplicou como a release **web**,
revision **1**, status **deployed**. O Helm adicionou seus próprios labels de rastreamento aos
objetos; o nosso label `app: web` é o que usamos para filtrar. Se o `helm install` falhar com
*"invalid ownership metadata"*, é porque um Deployment `web` avulso de um lab anterior ainda
existe — delete-o (`kubectl delete deploy,svc web`) e instale de novo, já que o Helm não adota
objetos que ele não criou.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ helm history web
REVISION  UPDATED  STATUS      CHART           APP VERSION  DESCRIPTION
1         ...      superseded  demo-app-0.1.0  v1         Install complete
2         ...      superseded  demo-app-0.1.0  v1         Upgrade complete
3         ...      deployed    demo-app-0.1.0  v1         Upgrade complete

$ kubectl get deploy web -o jsonpath='{.spec.replicas} {.spec.template.spec.containers[0].image}{"\n"}'
3 ghcr.io/platformrelay/workshop-web:v2
```

Cada `helm upgrade` renderizou de novo o **mesmo** template com novos values e armazenou uma
**nova revision**; as revisions anteriores viram `superseded`, mas são **mantidas**. Note que o
`APP VERSION` continua `v1` — esse é o `appVersion` do `Chart.yaml` (a aplicação que o chart
*descreve*), independente da `tag` da image em execução que sobrescrevemos. `--set` e `-f` fazem
o mesmo trabalho; o `-f` é como você mantém um arquivo de values por ambiente no Git.
</details>

**Pergunta:** a revision 3 só definiu `image.tag`, e mesmo assim `replicas` continuou 3. Por que
não voltou ao padrão 1 do `values.yaml`?

<details><summary>Resposta</summary>

O `helm upgrade` **reutiliza os values da release anterior** e faz o merge das suas novas
sobrescritas por cima — ele não volta aos padrões do `values.yaml`. A revision 2 tinha definido
`replicaCount=3`; o `-f values-prod.yaml` da revision 3 também carregava `replicaCount: 3`,
então as réplicas continuaram 3 enquanto a tag mudou. (Se algum dia quiser começar do zero a
partir dos padrões do chart, use `helm upgrade --reset-values`; para reutilizar explicitamente
os values anteriores, `--reuse-values`.)
</details>

---

### Step 5 — quebre um upgrade, depois faça rollback

Faça o upgrade para um conjunto de values que não consegue rodar — uma tag de image que não
existe — e observe os novos Pods falharem. Depois faça rollback para a última revision boa.

```bash
helm upgrade web demo-app --set image.tag=9.9.9-nope
kubectl get pods -l app=web
```

**Tarefa:** observe o novo Pod travado fazendo pull da image ruim (`ErrImagePull` / `ImagePullBackOff`).

<details><summary>Solução / saída esperada</summary>

```console
$ helm upgrade web demo-app --set image.tag=9.9.9-nope
Release "web" has been upgraded. Happy Helming!
...
REVISION: 4

$ kubectl get pods -l app=web
NAME                   READY   STATUS             RESTARTS   AGE
web-xxxxxxxxx-xxxxx    1/1     Running            0          5m     # antigo, ainda de pé
web-yyyyyyyyy-yyyyy    0/1     ImagePullBackOff   0          20s    # novo, não consegue o pull
```

O `helm upgrade` **teve sucesso como operação do Helm** — ele aplicou o manifesto e armazenou a
revision 4. Mas o *workload* está doente: o rolling update do Deployment subiu um novo Pod que
não consegue fazer o pull da `:9.9.9-nope`, então ele fica travado em `ImagePullBackOff`. O Pod
antigo continua servindo (o rolling update não o mata até o novo estar Ready — a lição do S06).
"o helm diz deployed" ≠ "a aplicação está saudável" — sempre verifique os Pods.
</details>

**Tarefa:** faça rollback para a última revision boa (3) e confirme a recuperação.

```bash
helm rollback web 3
helm history web
kubectl get pods -l app=web
```

<details><summary>Solução / saída esperada</summary>

```console
$ helm rollback web 3
Rollback was a success! Happy Helming!

$ helm history web
REVISION  UPDATED  STATUS      CHART           APP VERSION  DESCRIPTION
1         ...      superseded  demo-app-0.1.0  v1         Install complete
2         ...      superseded  demo-app-0.1.0  v1         Upgrade complete
3         ...      superseded  demo-app-0.1.0  v1         Upgrade complete
4         ...      superseded  demo-app-0.1.0  v1         Upgrade complete
5         ...      deployed    demo-app-0.1.0  v1         Rollback to 3

$ kubectl get pods -l app=web
NAME                   READY   STATUS    RESTARTS   AGE
web-xxxxxxxxx-xxxxx    1/1     Running   0          6m
```

Olhe o histórico com atenção: o rollback criou uma **nova revision 5** (`Rollback to 3`) — ele
**não** deletou a revision 4 nem "voltou" para a 3. Ele reaplicou os manifestos armazenados da
revision 3 (`:v2`, 3 réplicas), o Pod ruim sumiu e a aplicação está saudável de novo. Tudo
continua no histórico, então você pode avançar de novo.
</details>

**Pergunta (obrigatória):** o que uma revision realmente armazena, e o que o `helm rollback`
restaura?

<details><summary>Resposta</summary>

Uma **revision é um snapshot**, não um diff: ela armazena os **manifestos renderizados** + os
**values** que os produziram + a **metadata do chart** daquele install/upgrade. O Helm persiste
cada uma como um `Secret` do tipo `helm.sh/release.v1` no namespace da release (veja o Step 6).
O `helm rollback N` lê o snapshot armazenado da revision **N** e **o reaplica como uma revision
novinha, de número mais alto** — ou seja, ele restaura exatamente os *manifestos e values* da
revision N, **mantendo o histórico inteiro intacto** (nada é deletado, e você pode avançar de
novo). É por isso que o rollback do Helm é seguro e auditável.
</details>

---

### Step 6 — onde o histórico vive (leitura opcional)

```bash
kubectl get secret -l owner=helm -l name=web
```

<details><summary>Solução / saída esperada</summary>

```console
NAME                          TYPE                 DATA   AGE
sh.helm.release.v1.web.v1     helm.sh/release.v1   1      8m
sh.helm.release.v1.web.v2     helm.sh/release.v1   1      6m
sh.helm.release.v1.web.v3     helm.sh/release.v1   1      5m
sh.helm.release.v1.web.v4     helm.sh/release.v1   1      2m
sh.helm.release.v1.web.v5     helm.sh/release.v1   1      30s
```

Um `Secret` por revision, ali mesmo no seu namespace — isto **é** o histórico da release (é por
isso que o Helm não precisa de banco de dados no servidor). Delete esses Secrets e você perde a
capacidade de usar `helm history`/`rollback`. O `helm uninstall` os remove junto com o workload.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ helm package demo-app
Successfully packaged chart and saved it to: .../demo-app-0.1.0.tgz

$ helm push demo-app-0.1.0.tgz oci://localhost:5000/charts
Pushed: localhost:5000/charts/demo-app:0.1.0
Digest: sha256:...

$ helm install web2 oci://localhost:5000/charts/demo-app --version 0.1.0
NAME: web2
STATUS: deployed
REVISION: 1
```

O contraste central com um repo clássico: **nenhum `helm repo add`**. Um chart OCI é referenciado
direto pela sua URL `oci://…` (com `--version`), porque o registry já sabe servir artefatos por
tag/digest. Esse é o modelo de distribuição recomendado hoje — um registry só, uma história de
auth só, tanto para images quanto para charts. Para limpar: `helm uninstall web2`, depois
`docker rm -f registry`.

> **Namespace restricted:** se um namespace aplica o PSA `restricted` (do S17), o chart puro é
> **rejeitado** — mesmo o `workshop-web` rodando como non-root (UID 65532), o template não
> define **nenhum `securityContext`**, e uma image non-root é necessária, mas não suficiente. O
> `restricted` também exige `runAsNonRoot: true`, `allowPrivilegeEscalation: false`,
> `capabilities.drop: ["ALL"]` e `seccompProfile.type: RuntimeDefault`. Para que ele seja
> admitido, adicione esses quatro campos (o `securityContext` do Lab 17) ao `values.yaml`/ao
> template.
</details>

## Expected state / output

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

Statuses representativos incluem Pods Ready/Running, timeouts de NetworkPolicy, Forbidden de
RBAC, histórico de revisões do Helm, Application Synced/Healthy, Certificate Ready ou targets do
Prometheus — compare o significado, não nomes efêmeros.

## Explanation

O Helm registra as revisions da release como Secrets; "deployed" significa que o objeto da
release foi armazenado, não que o workload está saudável. O rollback cria uma nova revision que
reexecuta um snapshot mais antigo, e é essa a causa de o histórico crescer em vez de apagar o
upgrade ruim — você preserva as evidências enquanto restaura o serviço.

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
helm list -n "$NS"
helm history web -n "$NS"
kubectl get pods -n "$NS" -l app=web
helm rollback web 1 -n "$NS"
helm history web -n "$NS"
kubectl rollout status deploy/web -n "$NS"
```

### Expected state / output

Os Pods mostram ImagePullBackOff (ou similar) enquanto o Helm ainda diz deployed. Após o
rollback, os Pods ficam Ready e o helm history mostra uma nova revision que restaura o snapshot
anterior de chart/values sem deletar a linha da revision que falhou.

### Explanation

O Helm registra as revisions da release como Secrets; "deployed" significa que o objeto da
release foi armazenado, não que o workload está saudável. O rollback cria uma nova revision que
reexecuta um snapshot mais antigo, e é essa a causa de o histórico crescer em vez de apagar o
upgrade ruim — você preserva as evidências enquanto restaura o serviço.

### Hints

Compare o helm status com kubectl get pods -l app=web; use helm history e
helm rollback <revision> em vez de desinstalar a release.

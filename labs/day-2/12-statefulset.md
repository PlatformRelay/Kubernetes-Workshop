# Lab 12 — StatefulSet (S12)

<!-- lab-contract:v1 -->

| | |
| --- | --- |
| **Section** | S12 — StatefulSet |
| **Environment** | namespace ✓ / kind ✓ *(sem cluster-admin; assume-se uma StorageClass padrão)* |
| **Estimated time** | 30 min |

## Objective

Executar um workload que **não pode ser tratado como intercambiável**. Você vai aplicar um
**headless Service** e um **StatefulSet de 3 réplicas** com `volumeClaimTemplates`, e observar
as três garantias que um Deployment não pode te dar: Pods criados **em ordem** com **nomes
ordinais estáveis** (`web-0`, `web-1`, `web-2`), um **PVC por Pod** cunhado para cada ordinal, e
um **nome DNS estável por Pod** para descoberta de peers. Você vai escrever um sentinela no
`web-1`, deletá-lo, e provar que ele volta com o **mesmo nome**, religado ao **mesmo PVC** e aos
**mesmos dados** — depois quebrar a ligação do `serviceName` e ver o DNS entre peers apagar.

> **Defina seu namespace uma vez.** Tudo roda no seu namespace atribuído (ou em um cluster
> kind). Defina uma variável de shell para que todo comando possa ser copiado e colado:
>
> ```bash
> export NS=<your-assigned-namespace>          # usuários de kind: export NS=default
> kubectl config set-context --current --namespace="$NS"
> ```

## Prerequisites

- Conceitos dos Labs 05–07 (Pod, Deployment, Service) e do Lab 11 (PVC/StorageClass). Este lab
  **cria seus próprios** objetos, então não depende de sobras de labs anteriores.
- `kubectl` apontando para seu namespace atribuído **ou** um cluster kind local. Sem direitos de
  admin e sem add-ons — o kind já traz uma StorageClass `standard` padrão (o provisioner
  `local-path`) que fornece um PV por ordinal; clusters compartilhados têm uma StorageClass
  padrão provisionada.
- Um add-on de DNS de cluster (CoreDNS) — presente em todo cluster conformante e no kind. DNS
  entre peers é exatamente o propósito de um headless Service.

## Files used

- `headless-svc.yaml` — o headless Service `web` (`clusterIP: None`) que é dono do DNS por Pod.
- `statefulset.yaml` — o StatefulSet de 3 réplicas com `serviceName: web` e
  `volumeClaimTemplates` (um PVC por ordinal).
- `statefulset-bad-servicename.yaml` — o mesmo StatefulSet apontando `serviceName` para um
  Service que não existe, para o break→fix.

Tudo é rotulado com `app: s12` para que o cleanup seja um único label selector.

---

## Guided task

Percorra os passos sem abrir o companion, a menos que fique travado. O spoiler
contém os comandos exatos, o estado esperado, explicações e orientações de recuperação.

[Spoiler: soluções guiadas e saída esperada](./12-statefulset.solution.md#guided-solutions)

### Step 0 — aplique o headless Service

Um Service **headless** (`clusterIP: None`) não entrega um único IP virtual com load-balance.
Em vez disso, o DNS do cluster retorna um registro **por Pod** — é isso que dá a cada Pod do
StatefulSet um endereço estável que seus peers podem discar.

```bash
cat > headless-svc.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: web
  labels:
    app: s12
spec:
  clusterIP: None                 # headless — DNS por Pod, sem um único IP virtual
  selector:
    app: s12
  ports:
    - port: 80
      targetPort: 8080
      name: http
EOF

kubectl apply -f headless-svc.yaml
kubectl get svc web
```

**Tarefa:** confirme que o Service é headless (sem cluster IP).

---

### Step 1 — aplique o StatefulSet e observe a criação ordenada

```bash
cat > statefulset.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  labels:
    app: s12
spec:
  serviceName: web                # DEVE bater com o nome do headless Service (DNS por Pod)
  replicas: 3
  selector:
    matchLabels:
      app: s12
  template:
    metadata:
      labels:
        app: s12
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox           # a image da aplicação não tem shell — o sidecar é nossa caneta
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:           # um ESTÊNCIL de PVC — um cunhado por ordinal
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
EOF

kubectl apply -f statefulset.yaml

# observe o rollout ordenado — Ctrl-C quando os três estiverem Running
kubectl get pods -l app=s12 -w
```

**Tarefa:** em que ordem os Pods aparecem, e quais são seus nomes?

**Pergunta:** você definiu `replicas: 3` mas nunca escreveu três PVCs. De onde veio o
storage?

---

### Step 2 — confirme um PVC por ordinal

```bash
kubectl get pvc -l app=s12
```

**Tarefa:** quantos PVCs existem, e como são nomeados?

---

### Step 3 — escreva um sentinela no `web-1`

Dê a um ordinal específico alguns dados que possamos reconhecer depois.

```bash
kubectl exec web-1 -c toolbox -- sh -c 'echo "written by $(hostname)" > /data/data.txt'
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

---

### Step 4 — delete o `web-1`; prove que identidade **e** dados sobrevivem

Este é o coração da seção.

```bash
# delete apenas o ordinal do meio; o StatefulSet o recria imediatamente
kubectl delete pod web-1
kubectl get pods -l app=s12 -w        # Ctrl-C quando web-1 estiver Running de novo

# leia o sentinela a partir do web-1 SUBSTITUTO
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

**Tarefa:** que nome o Pod substituto recebe, e o sentinela ainda está lá?

**Pergunta:** por que o `web-1` reanexou seus dados antigos, quando um Pod de Deployment teria
voltado vazio?

---

### Step 5 — veja o DNS estável por Pod

O headless Service publica um nome DNS para **cada** Pod:
`<pod>.<serviceName>.<namespace>.svc.cluster.local`. Os peers usam esses nomes para se
encontrar. Resolva um deles a partir de outro Pod.

```bash
# resolva o nome por Pod do web-1 a partir de um Pod temporário (qualquer Pod conta como "um peer")
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"
```

**Tarefa:** `web-1.web.<ns>.svc.cluster.local` resolve para um IP?

---

### Step 6 — break→fix: um `serviceName` apontando para o nada

O `serviceName` precisa nomear um headless Service real, ou o DNS por Pod silenciosamente
nunca funciona — os Pods rodam bem, então nada parece errado até os peers falharem em
conectar. Dois detalhes tornam isso realista: `serviceName` é **imutável**, e um StatefulSet
quebrado ainda agenda Pods.

```bash
cat > statefulset-bad-servicename.yaml <<'EOF'
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web
  labels:
    app: s12
spec:
  serviceName: web-nope           # <-- nenhum headless Service com este nome existe
  replicas: 3
  selector:
    matchLabels:
      app: s12
  template:
    metadata:
      labels:
        app: s12
    spec:
      containers:
        - name: web
          image: ghcr.io/platformrelay/workshop-web:v1
          ports:
            - containerPort: 8080
          volumeMounts:
            - name: data
              mountPath: /data
        - name: toolbox
          image: busybox:1.37
          command: ["sleep", "infinity"]
          volumeMounts:
            - name: data
              mountPath: /data
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 1Gi
EOF

# primeiro tente aplicá-lo por cima do StatefulSet em execução
kubectl apply -f statefulset-bad-servicename.yaml
```

**Tarefa:** o apply é **rejeitado**. Por quê — e o que isso te diz sobre o `serviceName`?

**Tarefa:** agora crie de fato a versão quebrada (delete + recrie), depois teste o DNS entre
peers.

```bash
# delete o StatefulSet — seus PVCs (data-web-0/1/2) NÃO são deletados, então os dados estão seguros
kubectl delete statefulset web
kubectl apply -f statefulset-bad-servicename.yaml
kubectl rollout status statefulset/web        # os Pods sobem apesar do serviceName ruim

# os Pods rodam — mas o DNS por Pod resolve?
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"
```

**Tarefa:** conserte — recrie o StatefulSet com o `serviceName` correto, e confirme que o DNS
volta **e** os dados ainda estão lá.

```bash
kubectl delete statefulset web
kubectl apply -f statefulset.yaml               # o manifesto bom, serviceName: web
kubectl rollout status statefulset/web

# o DNS resolve de novo...
kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
  nslookup "web-1.web.$NS.svc.cluster.local"

# ...e o sentinela do Step 3 sobreviveu a DOIS ciclos de delete/recreate
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

## Observe

- Um Service **headless** (`clusterIP: None`) é o pré-requisito para DNS por Pod.
- Pods de StatefulSet têm **nomes ordinais estáveis** (`web-0/1/2`) e são criados **em ordem**
  (`web-0` Ready antes de `web-1` começar).
- `volumeClaimTemplates` cunha **um PVC por ordinal** (`data-web-<n>`), cada um provisionado
  dinamicamente e **grudado** ao seu Pod.
- Deletar um Pod o recria com o **mesmo nome**, religado ao **mesmo PVC** — identidade e dados
  sobrevivem.
- Cada Pod é endereçável em `<pod>.<serviceName>.<ns>.svc.cluster.local`, e isso resolve
  **apenas** enquanto existir um headless Service com o nome de `serviceName`.
- `serviceName` (e `selector`, `volumeClaimTemplates`) são **imutáveis** — mudá-los significa
  delete + recriação; os PVCs (e os dados) sobrevivem porque são objetos separados.

## Challenge

Os Pods de um StatefulSet nunca ficam Ready depois que alguém edita o serviceName para um
Service que não existe. Diagnostique a falha de identidade e restaure Pods Ready ordenados
com DNS estável.

**Difficulty:** Intermediate

**Success criteria:** Identifique o campo serviceName ruim, restaure o vínculo com o headless Service, mostre que
os Pods ordinais alcançam o status Ready, e prove que um nome DNS por Pod retorna um endereço.

**Hints:** Inspecione o spec.serviceName no StatefulSet e compare-o com kubectl get svc;
headless Services usam clusterIP: None.

[Spoiler: solução do challenge](./12-statefulset.solution.md#challenge-solution)

## Verify

Confirme a identidade ordinal antes do cleanup.

```bash
kubectl get sts,pods,pvc,svc -n "$NS"
kubectl get pods -n "$NS" -o wide
```

Esperado: os Pods ordinais estão Running/Ready (ou você já terminou o break→fix
e os restaurou), e os PVCs por ordinal ainda existem.

## Cleanup / reset

```bash
# cleanup com escopo — tudo que este lab criou é rotulado com app=s12
kubectl delete statefulset web --ignore-not-found -n "$NS"
kubectl delete svc web --ignore-not-found -n "$NS"

# IMPORTANTE: PVCs de volumeClaimTemplates NÃO são deletados automaticamente — remova-os explicitamente,
# ou eles (e seus PVs) ficam para trás e continuam custando storage.
kubectl delete pvc -l app=s12 -n "$NS" --ignore-not-found
# se o label selector voltou vazio no Step 2, delete por nome:
# kubectl delete pvc data-web-0 data-web-1 data-web-2 -n "$NS" --ignore-not-found

rm -f headless-svc.yaml statefulset.yaml statefulset-bad-servicename.yaml

# reset de pânico (namespace): também remove qualquer outra coisa que sobrou no seu namespace
# kubectl delete statefulset,svc,pod,pvc --all -n "$NS" --ignore-not-found
# reset de pânico (kind): make kind-down && make kind-up   # ou: kind delete cluster
```

> **Por que o cleanup deleta PVCs manualmente:** ao contrário de um Deployment, um StatefulSet
> deliberadamente mantém os PVCs de seus `volumeClaimTemplates` quando você o deleta ou reduz
> a escala — perder o disco de um banco de dados em um `kubectl delete` seria catastrófico. O
> opt-in moderno para automatizar isso é `spec.persistentVolumeClaimRetentionPolicy`
> (`whenDeleted` / `whenScaled`: `Retain` ou `Delete`); até você defini-lo, limpe os claims
> você mesmo.

## Stretch (opcional) — reduza as réplicas e escale de volta

Prove a garantia de sticky storage contra um ciclo de scale-down/up.

```bash
kubectl scale statefulset web --replicas=1        # remove web-2 e depois web-1 (ordem reversa)
kubectl get pods -l app=s12                        # só web-0 permanece
kubectl get pvc -l app=s12 || kubectl get pvc      # ...mas data-web-1 e data-web-2 PERMANECEM
kubectl scale statefulset web --replicas=3        # web-1, web-2 recriados em ordem
kubectl exec web-1 -c toolbox -- cat /data/data.txt   # o sentinela ainda está lá
```

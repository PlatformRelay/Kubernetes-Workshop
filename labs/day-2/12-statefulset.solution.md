# Lab 12 — StatefulSet (S12) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get svc web
NAME   TYPE        CLUSTER-IP   EXTERNAL-IP   PORT(S)   AGE
web    ClusterIP   None         <none>        80/TCP    3s
```

`CLUSTER-IP: None` é o marcador de headless. Um Service normal mostraria um IP virtual aqui e
o DNS resolveria o nome do Service para aquele único IP. Headless significa que o DNS retorna,
em vez disso, o **conjunto de IPs dos Pods** e — crucialmente para um StatefulSet — um nome
estável **por Pod**.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -l app=s12 -w
NAME    READY   STATUS              RESTARTS   AGE
web-0   0/2     ContainerCreating   0          1s
web-0   2/2     Running             0          6s
web-1   0/2     Pending             0          0s
web-1   2/2     Running             0          8s
web-2   0/2     Pending             0          0s
web-2   2/2     Running             0          7s
```

Os nomes são **ordinais estáveis** — `web-0`, `web-1`, `web-2` — e não o
`web-<hash>-<hash>` aleatório que um Deployment produz. Eles sobem **estritamente em ordem**:
o controller do StatefulSet espera o `web-0` ficar Ready antes de criar o `web-1`
(`podManagementPolicy: OrderedReady`, o padrão). (Nota: na StorageClass
`WaitForFirstConsumer` do kind, o PVC de cada ordinal faz bind conforme aquele Pod é agendado
— o mesmo comportamento que você viu no Lab 11.)
</details>

**Pergunta:** você definiu `replicas: 3` mas nunca escreveu três PVCs. De onde veio o
storage?

<details><summary>Resposta</summary>

De `volumeClaimTemplates`. É um **estêncil**, não um volume: o controller estampa um
PVC **por ordinal**, nomeado `<template>-<statefulset>-<ordinal>` → `data-web-0`,
`data-web-1`, `data-web-2`. Cada um é provisionado dinamicamente pela StorageClass padrão
exatamente como o PVC do Lab 11 — a única ideia nova é **um por Pod**, e ele fica colado
àquele ordinal entre restarts.
</details>

---

### Step 2 — confirme um PVC por ordinal

```bash
kubectl get pvc -l app=s12
```

**Tarefa:** quantos PVCs existem, e como são nomeados?

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pvc -l app=s12
NAME         STATUS   VOLUME             CAPACITY   ACCESS MODES   STORAGECLASS   AGE
data-web-0   Bound    pvc-a1b2...-1111   1Gi        RWO            standard       40s
data-web-1   Bound    pvc-c3d4...-2222   1Gi        RWO            standard       32s
data-web-2   Bound    pvc-e5f6...-3333   1Gi        RWO            standard       24s
```

**Três** PVCs — um por ordinal, `data-web-<n>`. Cada um está vinculado ao seu próprio PV. Essa
é a diferença em relação a um Deployment montando um único PVC: lá, toda réplica compartilha
um claim; aqui, cada Pod é dono do seu.

> **Repare no label.** Esses PVCs carregam `app: s12` porque `volumeClaimTemplates` copia os
> `metadata.labels` do template (definimos `app: s12` no `metadata` do StatefulSet, e os PVCs
> cunhados herdam os labels do StatefulSet). Se `kubectl get pvc -l app=s12` voltar vazio no
> seu cluster, remova o selector: `kubectl get pvc`.
</details>

---

### Step 3 — escreva um sentinela no `web-1`

Dê a um ordinal específico alguns dados que possamos reconhecer depois.

```bash
kubectl exec web-1 -c toolbox -- sh -c 'echo "written by $(hostname)" > /data/data.txt'
kubectl exec web-1 -c toolbox -- cat /data/data.txt
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl exec web-1 -c toolbox -- cat /data/data.txt
written by web-1
```

O arquivo vive em `data-web-1` (o PVC próprio do web-1), não na camada gravável do Pod.
Escrevemos o hostname do próprio Pod para que, após um delete/recreate, possamos provar que o
**mesmo** volume voltou — o conteúdo ainda vai dizer `web-1`, escrito pelo Pod original.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl delete pod web-1
pod "web-1" deleted
$ kubectl get pods -l app=s12
NAME    READY   STATUS    RESTARTS   AGE
web-0   2/2     Running   0          5m
web-1   2/2     Running   0          12s     # <-- mesmo NOME, um Pod novo por baixo
web-2   2/2     Running   0          5m
$ kubectl exec web-1 -c toolbox -- cat /data/data.txt
written by web-1
```

O substituto **ainda é `web-1`** (não um novo nome aleatório) e religou o **mesmo** PVC
`data-web-1`, então o sentinela — escrito pelo `web-1` *original* — está intacto. Identidade
e dados sobreviveram ao delete.
</details>

**Pergunta:** por que o `web-1` reanexou seus dados antigos, quando um Pod de Deployment teria
voltado vazio?

<details><summary>Resposta</summary>

Duas garantias do StatefulSet se combinam. **Identidade estável:** o controller sempre recria
o ordinal ausente com o *mesmo* nome (`web-1`), nunca um sufixo aleatório. **Sticky storage:**
cada ordinal é permanentemente associado ao seu próprio PVC (`data-web-1`), então o Pod
substituto religa exatamente aquele claim. Um Deployment não dá nenhuma das duas — um Pod
substituto recebe um novo nome aleatório e, compartilhando um único PVC (ou um `emptyDir`),
nenhuma memória por instância.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
Server:    10.96.0.10
Address:   10.96.0.10:53

Name:      web-1.web.<ns>.svc.cluster.local
Address:   10.244.1.7
```

Resolve para o IP do Pod `web-1`. O nome é construído a partir do `hostname` do Pod (`web-1`,
definido pelo StatefulSet) e do seu `subdomain` (`web`, definido a partir de `serviceName`) —
e ele resolve **apenas porque existe um headless Service chamado `web`** para publicar o
registro. É exatamente essa a ligação que o Step 6 quebra. (Se o `nslookup` retornar antes de
o Pod ter um endereço, dê alguns segundos ao rollout e tente de novo.)
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl apply -f statefulset-bad-servicename.yaml
The StatefulSet "web" is invalid: spec: Forbidden: updates to statefulset spec for fields
other than 'replicas', 'ordinals', 'template', 'updateStrategy',
'persistentVolumeClaimRetentionPolicy' and 'minReadySeconds' are forbidden
```

`serviceName` (como `selector` e `volumeClaimTemplates`) é **imutável** — você não pode
editá-lo em um StatefulSet vivo, exatamente como `storageClassName` era imutável no PVC do
Lab 11. Para mudá-lo você precisa **deletar e recriar**. Como os PVCs são objetos
independentes, os dados sobrevivem à recriação — o que vamos confirmar.

</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl rollout status statefulset/web
statefulset rolling update complete 3 pods at revision ...

$ kubectl get pods -l app=s12
NAME    READY   STATUS    RESTARTS   AGE
web-0   2/2     Running   0          20s
web-1   2/2     Running   0          14s
web-2   2/2     Running   0          8s

$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
** server can't find web-1.web.<ns>.svc.cluster.local: NXDOMAIN
pod "dnstest" deleted
```

Os Pods estão **Running** — um `serviceName` ruim não os impede de ser agendados — mas o
`subdomain` deles agora é `web-nope`, então nenhum registro por Pod é publicado sob `web`
(nem sob `web-nope`, já que nenhum Service com esse nome existe). `web-1.web…` retorna
**NXDOMAIN**. Essa é a armadilha: tudo parece saudável no `get pods`, e mesmo assim a
descoberta de peers está silenciosamente morta.
</details>

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

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl run dnstest --rm -it --restart=Never --image=busybox:1.36 -- \
    nslookup "web-1.web.$NS.svc.cluster.local"
Name:      web-1.web.<ns>.svc.cluster.local
Address:   10.244.1.9

$ kubectl exec web-1 -c toolbox -- cat /data/data.txt
written by web-1
```

Com `serviceName: web` batendo com o headless Service existente, o registro por Pod é
publicado de novo e resolve. E repare: `data.txt` ainda diz `written by web-1` mesmo tendo
deletado e recriado o **StatefulSet inteiro duas vezes**. Os PVCs (`data-web-0/1/2`) são
objetos separados com seu próprio ciclo de vida — deletar o StatefulSet nunca os tocou.
</details>

### Stretch (opcional) — reduza as réplicas e escale de volta

Prove a garantia de sticky storage contra um ciclo de scale-down/up.

```bash
kubectl scale statefulset web --replicas=1        # remove web-2 e depois web-1 (ordem reversa)
kubectl get pods -l app=s12                        # só web-0 permanece
kubectl get pvc -l app=s12 || kubectl get pvc      # ...mas data-web-1 e data-web-2 PERMANECEM
kubectl scale statefulset web --replicas=3        # web-1, web-2 recriados em ordem
kubectl exec web-1 -c toolbox -- cat /data/data.txt   # o sentinela ainda está lá
```

<details><summary>Solução / o que você está vendo</summary>

```console
$ kubectl get pods -l app=s12       # depois de escalar para 1
NAME    READY   STATUS    RESTARTS   AGE
web-0   2/2     Running   0          10m

$ kubectl get pvc -l app=s12        # os PVCs dos ordinais removidos são mantidos
NAME         STATUS   VOLUME             CAPACITY   ACCESS MODES   STORAGECLASS   AGE
data-web-0   Bound    pvc-a1b2...        1Gi        RWO            standard       10m
data-web-1   Bound    pvc-c3d4...        1Gi        RWO            standard       10m
data-web-2   Bound    pvc-e5f6...        1Gi        RWO            standard       10m

$ kubectl exec web-1 -c toolbox -- cat /data/data.txt   # depois de escalar de volta para 3
written by web-1
```

O scale-down remove Pods em **ordem ordinal reversa** (`web-2`, depois `web-1`) mas **mantém
seus PVCs**. Escale de volta e cada ordinal que retorna religa seu claim original — então o
`web-1` ainda tem seu sentinela. Esse comportamento de PVC retido é a causa de o passo de
cleanup acima ter que deletar os claims explicitamente.
</details>

## Expected state / output

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

Status representativos incluem Pods Running/Complete/Failed, PVCs Bound, conditions
Accepted de Gateway ou TARGETS numéricos de HPA — compare o significado, não nomes efêmeros.

## Explanation

A identidade DNS do StatefulSet é <pod>.<serviceName>. Se o serviceName aponta para o nada,
os Pods ordinais não ganham identidade de rede estável mesmo quando os PVCs existem — o
serviceName errado é a causa direta da falha. Restaurar o headless Service nomeado religa a
identidade sem recriar os volumeClaimTemplates.

Os passos guiados acima provam o comportamento do control plane desta seção; leia os Events e
os campos de status quando uma fase de uma linha só for ambígua.

## Troubleshooting and recovery

Se os Pods ordinais nunca ficarem Ready, compare `kubectl get statefulset -n "$NS" -o yaml` —
especialmente `spec.serviceName` — com `kubectl get svc -n "$NS"`. Restaure o headless Service
com `kubectl apply -f headless-svc.yaml -n "$NS"` (ou o manifesto de Service nomeado do lab);
como `serviceName` é imutável, faça `kubectl delete statefulset web -n "$NS"` antes de
`kubectl apply -f statefulset.yaml -n "$NS"` para que os Pods ordenados possam se anexar. Prove a identidade com `kubectl get endpointslices -n "$NS"` ou um lookup de DNS
contra `web-0.<service>.$NS.svc`.

## Challenge solution

### Commands / manifest

```bash
kubectl get sts -n "$NS" -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.spec.serviceName}{"\n"}{end}'
kubectl get svc -n "$NS"
kubectl apply -f headless-svc.yaml -n "$NS"
kubectl apply -f statefulset.yaml -n "$NS"
kubectl rollout status sts/web -n "$NS"
kubectl run -n "$NS" tmp --rm -i --restart=Never --image=busybox:1.37 -- nslookup web-0.web
```

### Expected state / output

Os Pods alcançam o status Ready em ordem ordinal. O nslookup retorna um endereço para o
nome DNS por Pod. O diagnóstico nomeia o governing Service ausente ou errado, e não uma
falha de PVC ou de image.

### Explanation

A identidade DNS do StatefulSet é <pod>.<serviceName>. Se o serviceName aponta para o nada,
os Pods ordinais não ganham identidade de rede estável mesmo quando os PVCs existem — o
serviceName errado é a causa direta da falha. Restaurar o headless Service nomeado religa a
identidade sem recriar os volumeClaimTemplates.

### Hints

Inspecione o spec.serviceName no StatefulSet e compare-o com kubectl get svc;
headless Services usam clusterIP: None.

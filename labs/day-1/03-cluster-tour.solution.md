# Lab 03 — Modelo mental do Kubernetes (S03) — soluções

Use este companion depois de tentar o lab do participante. As saídas contêm nomes, endereços,
idades e tamanhos de image representativos; compare o estado e o significado em vez de copiar
literalmente valores efêmeros.

## Guided solutions

### Step 1 — os nodes: onde seus containers realmente rodam

Todo Pod roda em um node. Pergunte ao cluster como são seus nodes.

```bash
kubectl get nodes -o wide
```

**Tarefa:** execute e leia uma linha inteira até as colunas **OS-IMAGE**, **KERNEL-VERSION** e
**CONTAINER-RUNTIME**. Essa última coluna é a mesma pilha de runtime que você conheceu na
S01.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get nodes -o wide
NAME              STATUS   ROLES           AGE   VERSION   INTERNAL-IP   OS-IMAGE                     KERNEL-VERSION   CONTAINER-RUNTIME
workshop-cp       Ready    control-plane   4h    v1.3x.y   172.18.0.2    Debian GNU/Linux 12          6.x.y            containerd://1.7.x
```

- No **kind** você normalmente verá um node (`*-control-plane`); um cluster compartilhado
  mostra muitos worker nodes e suas roles.
- **CONTAINER-RUNTIME** mostra `containerd://…` (ou `cri-o://…`) — o runtime CRI que o
  kubelet comanda. O Kubernetes não roda containers por conta própria; ele manda esse
  runtime rodar.

</details>

<details><summary>Cluster compartilhado: recebeu <code>Error ... "nodes" is forbidden</code>?</summary>

```console
$ kubectl get nodes -o wide
Error from server (Forbidden): nodes is forbidden: User "..." cannot list
resource "nodes" in API group "" at the cluster scope
```

Isso não é um engano — listar nodes é **cluster-scoped**, e sua role do workshop tem
escopo no seu namespace (least privilege, exatamente como no Lab 00). Anote a mensagem e
continue; você não precisa de acesso a nodes para o resto do lab. No **kind** você é dono do
cluster, então isso sempre funciona.
</details>

---

### Step 2 — a API é autodocumentada

Você nunca precisa memorizar campos. O cluster traz seu próprio schema.

```bash
kubectl api-resources | head -20      # todo kind que o cluster entende
kubectl explain pod.spec              # o schema por trás da spec de um Pod
```

**Tarefa:** execute os dois. No `api-resources`, encontre as colunas `SHORTNAMES`, `APIVERSION` e
`NAMESPACED`. No `explain`, leia os primeiros campos de `pod.spec`.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl api-resources | head -6
NAME          SHORTNAMES   APIVERSION   NAMESPACED   KIND
pods          po           v1           true         Pod
services      svc          v1           true         Service
nodes         no           v1           false        Node
namespaces    ns           v1           false        Namespace
deployments   deploy       apps/v1      true         Deployment

$ kubectl explain pod.spec
KIND:       Pod
VERSION:    v1
FIELD: spec <PodSpec>
DESCRIPTION:
    ...
FIELDS:
  containers    <[]Container> -required-
  ...
  restartPolicy <string>
  nodeName      <string>
```

`NAMESPACED=false` marca kinds cluster-scoped (Node, Namespace) — os que uma role com
escopo de namespace não pode listar. O `explain` lê o mesmo schema OpenAPI contra o qual o
API server valida, então está sempre correto para a versão do **seu** cluster.
</details>

**Pergunta:** o que `kubectl explain pod.spec.restartPolicy` diz que é o padrão?

<details><summary>Resposta</summary>

```console
$ kubectl explain pod.spec.restartPolicy
KIND:       Pod
VERSION:    v1
FIELD: restartPolicy <string>
DESCRIPTION:
    Restart policy for all containers within the pod. One of Always, OnFailure,
    Never. ... Default to Always.
```

O padrão é **`Always`** — e é por isso que o container de um Pod avulso continua
reiniciando. Usamos isso no Lab 05. Recorrer ao `explain` em vez de uma busca na web é o
hábito a construir.
</details>

---

### Step 3 — encontre o control plane (ou seu namespace)

Os componentes do control plane dos slides — API server, etcd, scheduler,
controller-manager — rodam como Pods no namespace `kube-system` em um
cluster self-hosted/kind.

#### Caminho kind (você é dono do cluster)

```bash
kubectl get pods -n kube-system
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl get pods -n kube-system
NAME                                    READY   STATUS    RESTARTS   AGE
etcd-workshop-control-plane             1/1     Running   0          4h
kube-apiserver-workshop-control-plane   1/1     Running   0          4h
kube-controller-manager-...             1/1     Running   0          4h
kube-scheduler-workshop-control-plane   1/1     Running   0          4h
coredns-...                             1/1     Running   0          4h
kindnet-...                             1/1     Running   0          4h
kube-proxy-...                          1/1     Running   0          4h
```

Lá estão eles: `etcd`, `kube-apiserver`, `kube-controller-manager`,
`kube-scheduler` — as quatro caixas do slide, rodando como Pods comuns. As nuvens
gerenciadas escondem esses Pods, mas eles continuam existindo.
</details>

#### Caminho do namespace (cluster compartilhado, alternativa read-only)

O `kube-system` não é seu para ler em um cluster compartilhado. Explore o que **é** — seu
próprio namespace:

```bash
kubectl describe namespace "$NS"
kubectl get all -n "$NS"
```

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl describe namespace student-07
Name:         student-07
Labels:       kubernetes.io/metadata.name=student-07
Status:       Active
...

$ kubectl get all -n student-07
No resources found in student-07 namespace.
```

Um namespace vazio é o estado limpo correto (você ainda não construiu nada). O control
plane continua lá fazendo seu trabalho pelo seu namespace — você só não pode espiar os
Pods dele, que é o RBAC funcionando como projetado.
</details>

---

### Step 4 — quebre de propósito: um `explain` com typo

Todo lab tem um **break→fix** deliberado. Aqui é o deslize mais comum do `kubectl`:
um path de campo digitado errado. Veja-o falhar, leia o erro, depois conserte.

```bash
kubectl explain pod.spce      # typo: "spce" em vez de "spec"
```

**Tarefa:** execute. Ele deve **falhar**. Leia o erro, depois execute o comando corrigido.

<details><summary>Solução / saída esperada</summary>

```console
$ kubectl explain pod.spce
error: field "spce" does not exist
```

*(O texto exato varia levemente conforme a versão do `kubectl` — o ponto é que ele nomeia o
campo ruim e se recusa, em vez de adivinhar.)* Como o `explain` valida o path
contra o schema real, um typo não consegue passar. Conserte:

```console
$ kubectl explain pod.spec
KIND:       Pod
VERSION:    v1
FIELD: spec <PodSpec>
...
```

Este é um break **seguro** — o `explain` só lê schema, então não há nada para limpar.
Compare com o Lab 05, onde um *manifesto* ruim realmente cria um Pod que falha.
</details>

**Pergunta:** por que um typo no `explain` é inofensivo, mas um typo em um manifesto que
você `apply` pode não ser?

<details><summary>Resposta</summary>

O `explain` só **lê** o schema — nenhum objeto é criado ou alterado. O `apply` envia um
manifesto ao API server, que cria/atualiza um objeto real; um typo ali pode
produzir um workload quebrado (ou, para um campo desconhecido, ser rejeitado ou
silenciosamente descartado dependendo da validação). É por isso que os próximos labs sempre
acompanham o `apply` de `kubectl describe` e `get` para confirmar o que de fato aconteceu.
</details>

---

### Step 5 — veja a reconciliação: spec vs status em um objeto vivo

Os slides disseram que a reconciliação leva o **status** (observado) em direção à **spec** (desejado).
Todo objeto carrega as duas metades — leia-as em algo que já está rodando.

Escolha qualquer objeto existente. No **kind**, um Pod do `kube-system` funciona; em um cluster
**compartilhado** onde seu namespace está vazio, todo objeto Namespace também tem `spec`/`status`,
então use isso como fallback.

```bash
# kind (ou qualquer lugar onde você possa ler um Pod):
kubectl get pods -n kube-system \
  -l component=kube-apiserver -o yaml | head -40

# compartilhado, fallback só de namespace — todo objeto tem spec/status:
kubectl get namespace "$NS" -o yaml
```

**Tarefa:** no YAML, encontre o bloco `spec:` de nível superior e o bloco `status:`
de nível superior. Note que você não *escreveu* nada em `status` — o sistema escreveu.

<details><summary>Solução / o que você está vendo</summary>

```yaml
spec:                     # DESEJADO — escrito por quem criou o objeto
  containers:
    - name: kube-apiserver
      image: registry.k8s.io/kube-apiserver:v1.3x.y
status:                   # OBSERVADO — escrito pelo kubelet / controllers
  phase: Running
  podIP: 172.18.0.2
  conditions:
    - type: Ready
      status: "True"
```

Para o fallback de Namespace os blocos são menores, mas o formato é idêntico:

```yaml
spec:
  finalizers: [kubernetes]
status:
  phase: Active
```

`spec` é o pedido; `status` é a realidade. A reconciliação é o loop fechando a lacuna
entre eles — a animação do slide, em um objeto real.
</details>

**Pergunta:** qual componente *escreve* o `status` de um Pod, e qual componente
decidiu *em qual node* a `spec` do Pod roda?

<details><summary>Resposta</summary>

- O **kubelet** no node do Pod escreve o `status` do Pod (ele observa os containers
  reais e reporta de volta através do API server).
- O **scheduler** definiu `spec.nodeName` — ele observou um Pod sem node e vinculou
  um. Ele apenas *decide*; quem executa é o kubelet. Ambos falam **apenas** com o API
  server, nunca diretamente com o etcd.

</details>

---

## Expected state / output

- `kubectl get nodes -o wide` mostra um `CONTAINER-RUNTIME` `containerd`/`cri-o` —
  a pilha CRI da S01 (ou um `Forbidden` que você sabe explicar, em um cluster
  compartilhado restrito).
- `kubectl api-resources` distingue kinds namespaced de kinds cluster-scoped.
- `kubectl explain` responde perguntas de schema com autoridade e **rejeita** um path de
  campo com typo em vez de adivinhar.
- No kind, o control plane fica visível como Pods no `kube-system`; em um cluster compartilhado,
  ele não é seu para ler — e isso está correto.
- Todo objeto vivo tem uma `spec` (desejado, você escreve) e um `status` (observado, o
  sistema escreve) — a reconciliação é o loop entre eles.

---

## Explanation

O Kubernetes expõe seu schema de recursos por meio de discovery e do `kubectl explain`. Escopo
de cluster e escopo de namespace são fronteiras de autorização — a causa dos erros `Forbidden`
em um cluster compartilhado — enquanto `spec` e `status` expõem a divisão desejado/observado
que os controllers reconciliam continuamente.

## Troubleshooting and recovery

Uma resposta Forbidden em nodes ou no `kube-system` é esperada em um
cluster compartilhado. Use o caminho do namespace e confirme com `kubectl auth can-i get pods -n "$NS"`.
No kind local, faça o reset para o contexto do workshop com
`kubectl config use-context kind-workshop`; em um cluster compartilhado, pare e peça ao facilitador
o contexto atribuído em vez de mudar outro namespace.

## Challenge solution

### Commands / manifest

```bash
kubectl explain pod.spec --recursive | grep -i -E 'readiness|liveness'
kubectl explain pod.spec.containers.readinessProbe
kubectl explain pod.spec.containers.livenessProbe
```

### Expected state / output

A busca recursiva revela `readinessProbe` e `livenessProbe` abaixo de `containers`; os
comandos focados identificam cada path como um objeto e mostram seus campos filhos suportados.

### Explanation

A saída recursiva é um mapa de descoberta, enquanto um `kubectl explain` focado valida o path
exato da API e o schema. Isso é mais seguro do que adivinhar nomes de campos de memória ou a
partir de um exemplo desatualizado — adivinhação é uma causa comum de manifesto inválido.

### Hints

Encaminhe a saída recursiva por `grep -i -E 'readiness|liveness'`, depois confirme cada
resultado com um comando `kubectl explain` focado.
